#!/usr/bin/env python3
"""
IdoRacing Live Pedal & Trail Braking HUD for Linux.
Real-time translucent floating overlay displaying live Throttle and Brake/Trail Braking
oscilloscope curves, plus in-game controls for Pep's spotter radio (Mute/Unmute & Volume).

Runs natively over ACC, LMU, AC, and all supported simulators via PySide6 (Qt6).
Listens to 50Hz UDP telemetry on 127.0.0.1:10824.
"""

from __future__ import annotations

import argparse
import json
import select
import socket
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any

try:
    from PySide6.QtCore import QPoint, QRectF, Qt, QTimer
    from PySide6.QtGui import QBrush, QColor, QFont, QMouseEvent, QPainter, QPainterPath, QPen
    from PySide6.QtWidgets import (
        QApplication,
        QHBoxLayout,
        QLabel,
        QPushButton,
        QVBoxLayout,
        QWidget,
    )

    HAS_PYSIDE6 = True
except ImportError:
    HAS_PYSIDE6 = False
    QWidget = object  # type: ignore

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "data" / "spotter_config.json"
UDP_PORT = 10824
HISTORY_SECONDS = 3.5  # Window span displayed on screen


def load_spotter_config() -> dict[str, Any]:
    """Load spotter preferences from data/spotter_config.json."""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, encoding="utf-8") as f:
                data = json.load(f)
                return {
                    "enabled": bool(data.get("enabled", True)),
                    "language": str(data.get("language", "es")),
                    "volume": max(0, min(100, int(data.get("volume", 85)))),
                }
        except (OSError, ValueError):
            pass
    return {"enabled": True, "language": "es", "volume": 85}


def save_spotter_config(cfg: dict[str, Any]) -> None:
    """Save spotter preferences directly to data/spotter_config.json."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Read existing to preserve extra fields like toggle_key
        existing = {}
        if CONFIG_PATH.exists():
            try:
                with open(CONFIG_PATH, encoding="utf-8") as f:
                    existing = json.load(f)
            except (OSError, ValueError):
                pass
        existing["enabled"] = bool(cfg.get("enabled", True))
        existing["volume"] = max(0, min(100, int(cfg.get("volume", 85))))
        if "language" in cfg:
            existing["language"] = str(cfg["language"])

        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2)
    except OSError:
        pass


class PedalTraceWidget(QWidget):
    """Custom oscilloscope widget rendering live Throttle and Trail Braking curves."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setMinimumSize(420, 130)
        self.samples: deque[tuple[float, float, float]] = deque(maxlen=400)  # (timestamp, gas, brake)
        self.current_gas: float = 0.0
        self.current_brake: float = 0.0
        self.current_gear: int = 0
        self.current_speed: float = 0.0
        self.last_packet_time: float = 0.0

    def add_sample(self, gas: float, brake: float, gear: int, speed: float, now: float) -> None:
        self.current_gas = max(0.0, min(1.0, gas))
        self.current_brake = max(0.0, min(1.0, brake))
        self.current_gear = gear
        self.current_speed = speed
        self.last_packet_time = now
        self.samples.append((now, self.current_gas, self.current_brake))

    def paintEvent(self, _event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        rect = self.rect()
        w = rect.width()
        h = rect.height()

        # 1. Background dark translucent container
        bg_color = QColor(14, 17, 23, 230)
        border_color = QColor(255, 255, 255, 30)
        painter.setBrush(QBrush(bg_color))
        painter.setPen(QPen(border_color, 1.0))
        painter.drawRoundedRect(QRectF(1, 1, w - 2, h - 2), 8, 8)

        # Usable graph area inside margins
        margin_left = 38.0
        margin_right = 14.0
        margin_top = 16.0
        margin_bottom = 22.0
        gw = w - margin_left - margin_right
        gh = h - margin_top - margin_bottom

        if gw <= 10 or gh <= 10:
            return

        # 2. Horizontal grid lines (0%, 25%, 50%, 75%, 100%)
        grid_font = QFont("Sans-Serif", 7, QFont.Weight.Bold)
        painter.setFont(grid_font)
        for pct, label in [(0.0, "0%"), (0.25, "25%"), (0.50, "50%"), (0.75, "75%"), (1.0, "100%")]:
            y = margin_top + gh * (1.0 - pct)
            # Grid line
            painter.setPen(QPen(QColor(255, 255, 255, 22), 1.0, Qt.PenStyle.DashLine))
            painter.drawLine(int(margin_left), int(y), int(margin_left + gw), int(y))
            # Label
            painter.setPen(QColor(160, 170, 190, 180))
            painter.drawText(
                QRectF(4, y - 6, margin_left - 8, 12),
                Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter,
                label,
            )

        now = time.time()
        is_live = (now - self.last_packet_time) < 2.0 and len(self.samples) > 0

        if not is_live:
            # Idle prompt
            painter.setPen(QColor(160, 175, 200, 160))
            idle_font = QFont("Sans-Serif", 9, QFont.Weight.Medium)
            painter.setFont(idle_font)
            painter.drawText(
                QRectF(margin_left, margin_top, gw, gh),
                Qt.AlignmentFlag.AlignCenter,
                "Waiting for 50Hz live telemetry (ACC, LMU, AC...)",
            )
            return

        # 3. Draw Throttle (Green) & Brake/Trail (Red) curves
        t_min = now - HISTORY_SECONDS
        t_span = HISTORY_SECONDS

        gas_path = QPainterPath()
        brake_path = QPainterPath()
        has_gas = False
        has_brake = False

        for t_sample, g_val, b_val in self.samples:
            if t_sample < t_min:
                continue
            x = margin_left + ((t_sample - t_min) / t_span) * gw
            y_gas = margin_top + gh * (1.0 - g_val)
            y_brake = margin_top + gh * (1.0 - b_val)

            if not has_gas:
                gas_path.moveTo(x, y_gas)
                has_gas = True
            else:
                gas_path.lineTo(x, y_gas)

            if not has_brake:
                brake_path.moveTo(x, y_brake)
                has_brake = True
            else:
                brake_path.lineTo(x, y_brake)

        # Draw Throttle Line (Neon Green)
        if has_gas:
            painter.setPen(
                QPen(
                    QColor(34, 197, 94, 240),
                    2.5,
                    Qt.PenStyle.SolidLine,
                    Qt.PenCapStyle.RoundCap,
                    Qt.PenJoinStyle.RoundJoin,
                )
            )
            painter.drawPath(gas_path)

        # Draw Brake / Trail Braking Line (Racing Red)
        if has_brake:
            painter.setPen(
                QPen(
                    QColor(239, 68, 68, 240),
                    2.5,
                    Qt.PenStyle.SolidLine,
                    Qt.PenCapStyle.RoundCap,
                    Qt.PenJoinStyle.RoundJoin,
                )
            )
            painter.drawPath(brake_path)

        # 4. Live badges at bottom
        badge_font = QFont("Sans-Serif", 8, QFont.Weight.Bold)
        painter.setFont(badge_font)

        # Throttle Badge
        gas_pct = int(self.current_gas * 100)
        painter.setPen(QColor(34, 197, 94, 255))
        painter.drawText(
            QRectF(margin_left, h - margin_bottom + 4, 110, 16), Qt.AlignmentFlag.AlignLeft, f"THROTTLE: {gas_pct}%"
        )

        # Brake / Trail Braking Badge
        brake_pct = int(self.current_brake * 100)
        is_trailing = 0.05 < self.current_brake < 0.85
        brake_text = f"BRAKE: {brake_pct}% [TRAIL]" if is_trailing else f"BRAKE: {brake_pct}%"
        painter.setPen(QColor(239, 68, 68, 255))
        painter.drawText(
            QRectF(margin_left + 115, h - margin_bottom + 4, 150, 16), Qt.AlignmentFlag.AlignLeft, brake_text
        )

        # Speed and Gear
        gear_str = "R" if self.current_gear == -1 else ("N" if self.current_gear == 0 else str(self.current_gear))
        painter.setPen(QColor(200, 210, 230, 220))
        painter.drawText(
            QRectF(w - margin_right - 140, h - margin_bottom + 4, 140, 16),
            Qt.AlignmentFlag.AlignRight,
            f"G: {gear_str} | {int(self.current_speed)} km/h",
        )


class PedalHudWindow(QWidget):
    """
    Main transparent floating overlay window for Linux.
    Draggable, always on top, with real-time pedal trace and Pep radio controls.
    """

    def __init__(self, udp_port: int = UDP_PORT) -> None:
        super().__init__()
        self.udp_port = udp_port
        self.drag_position = QPoint()
        self.spotter_config = load_spotter_config()

        self.init_ui()
        self.init_udp_socket()

    def init_ui(self) -> None:
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.resize(480, 210)

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(8, 8, 8, 8)
        main_layout.setSpacing(4)

        # Header bar
        header = QHBoxLayout()
        header.setContentsMargins(4, 2, 4, 2)

        # Title / Drag handle
        title = QLabel("⚡ IDORACING TRAIL HUD")
        title.setStyleSheet("color: #94a3b8; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;")
        header.addWidget(title)

        header.addStretch()

        # Pep Radio Mute Toggle Button
        self.btn_pep = QPushButton()
        self.btn_pep.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_pep.clicked.connect(self.toggle_pep_radio)
        self.update_pep_button()
        header.addWidget(self.btn_pep)

        # Volume Controls (- / +)
        self.btn_vol_down = QPushButton("🔉 -")
        self.btn_vol_down.setToolTip("Bajar volumen de Pep")
        self.btn_vol_down.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_vol_down.setStyleSheet(
            "background: #1e293b; color: #cbd5e1; border: 1px solid #334155; border-radius: 4px; padding: 2px 6px; font-size: 10px;"
        )
        self.btn_vol_down.clicked.connect(self.vol_down)
        header.addWidget(self.btn_vol_down)

        self.lbl_vol = QLabel(f"{self.spotter_config.get('volume', 85)}%")
        self.lbl_vol.setStyleSheet(
            "color: #cbd5e1; font-size: 10px; font-weight: bold; min-width: 28px; text-align: center;"
        )
        header.addWidget(self.lbl_vol)

        self.btn_vol_up = QPushButton("🔊 +")
        self.btn_vol_up.setToolTip("Subir volumen de Pep")
        self.btn_vol_up.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_vol_up.setStyleSheet(
            "background: #1e293b; color: #cbd5e1; border: 1px solid #334155; border-radius: 4px; padding: 2px 6px; font-size: 10px;"
        )
        self.btn_vol_up.clicked.connect(self.vol_up)
        header.addWidget(self.btn_vol_up)

        # Close button [✕]
        btn_close = QPushButton("✕")
        btn_close.setToolTip("Cerrar HUD (Esc)")
        btn_close.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_close.setStyleSheet("""
            QPushButton {
                background: #334155; color: #f87171; border: none; border-radius: 4px;
                font-size: 11px; font-weight: bold; width: 22px; height: 20px;
            }
            QPushButton:hover { background: #ef4444; color: white; }
        """)
        btn_close.clicked.connect(self.close)
        header.addWidget(btn_close)

        main_layout.addLayout(header)

        # Trace widget
        self.trace_widget = PedalTraceWidget(self)
        main_layout.addWidget(self.trace_widget)

    def init_udp_socket(self) -> None:
        """Bind non-blocking UDP socket to receive telemetry from recorder."""
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self.sock.bind(("127.0.0.1", self.udp_port))
        except OSError as err:
            print(f"idoracing-hud: warning: could not bind UDP {self.udp_port}: {err}")
        self.sock.setblocking(False)

        # 60 FPS update loop
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_telemetry)
        self.timer.start(16)

    def update_telemetry(self) -> None:
        """Read UDP telemetry queue and redraw canvas."""
        now = time.time()

        while True:
            r, _, _ = select.select([self.sock], [], [], 0)
            if not r:
                break
            try:
                data, _ = self.sock.recvfrom(512)
                pkt = json.loads(data.decode("utf-8"))
                gas = float(pkt.get("gas", 0.0))
                brake = float(pkt.get("brake", 0.0))
                gear = int(pkt.get("gear", 0))
                speed = float(pkt.get("speed_kmh", 0.0))
                self.trace_widget.add_sample(gas, brake, gear, speed, now)
            except (ValueError, KeyError, OSError):
                break

        # Always trigger repaint for smooth continuous scrolling
        self.trace_widget.update()

    def update_pep_button(self) -> None:
        enabled = self.spotter_config.get("enabled", True)
        if enabled:
            self.btn_pep.setText("📻 Pep: Active")
            self.btn_pep.setStyleSheet("""
                QPushButton {
                    background: rgba(16, 185, 129, 0.25); color: #34d399;
                    border: 1px solid #059669; border-radius: 4px;
                    padding: 2px 8px; font-size: 10px; font-weight: bold;
                }
                QPushButton:hover { background: rgba(16, 185, 129, 0.45); }
            """)
        else:
            self.btn_pep.setText("🔇 Pep: MUTED")
            self.btn_pep.setStyleSheet("""
                QPushButton {
                    background: rgba(239, 68, 68, 0.25); color: #f87171;
                    border: 1px solid #dc2626; border-radius: 4px;
                    padding: 2px 8px; font-size: 10px; font-weight: bold;
                }
                QPushButton:hover { background: rgba(239, 68, 68, 0.45); }
            """)

    def toggle_pep_radio(self) -> None:
        """Toggle Pep spotter enabled state and persist immediately."""
        now_enabled = not self.spotter_config.get("enabled", True)
        self.spotter_config["enabled"] = now_enabled
        save_spotter_config(self.spotter_config)
        self.update_pep_button()

    def vol_down(self) -> None:
        vol = max(0, self.spotter_config.get("volume", 85) - 5)
        self.spotter_config["volume"] = vol
        save_spotter_config(self.spotter_config)
        self.lbl_vol.setText(f"{vol}%")

    def vol_up(self) -> None:
        vol = min(100, self.spotter_config.get("volume", 85) + 5)
        self.spotter_config["volume"] = vol
        save_spotter_config(self.spotter_config)
        self.lbl_vol.setText(f"{vol}%")

    # Draggable window behavior
    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if event.buttons() == Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self.drag_position)
            event.accept()

    def keyPressEvent(self, event) -> None:
        # Esc or Q closes the window cleanly
        if event.key() in (Qt.Key.Key_Escape, Qt.Key.Key_Q):
            self.close()
        else:
            super().keyPressEvent(event)

    def closeEvent(self, event) -> None:
        if hasattr(self, "sock"):
            self.sock.close()
        event.accept()


def main() -> None:
    if not HAS_PYSIDE6:
        print("idoracing-hud: PySide6 no está instalado en este entorno Python.")
        print("Ejecútalo con el Python del sistema: /usr/bin/python3 tools/pedal_hud.py")
        print("O instala PySide6 con: pip install PySide6")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="IdoRacing Live Pedal & Trail Braking Overlay")
    parser.add_argument("--udp-port", type=int, default=UDP_PORT, help="UDP telemetry port (default: 10824)")
    args = parser.parse_args()

    app = QApplication(sys.argv)
    window = PedalHudWindow(udp_port=args.udp_port)
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
