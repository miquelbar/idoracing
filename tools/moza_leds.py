#!/usr/bin/env python3
"""
IdoRacing Moza RPM LEDs Bridge for Linux.
Directly drives the RPM shift lights on Moza steering wheels (CS V2P, GS, KS, ES, FSR)
from 50Hz simulator telemetry without requiring Moza Pit House or SimHub.

Protocol: Moza CDC-ACM Serial Protocol (115200 baud, Group 0x3F, Checksum = (13 + sum) % 256).
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import select
import signal
import socket
import termios
import time

UDP_PORT = 10823
NUM_LEDS = 10
START_PCT = 0.75  # First LED lights up at 75% of max RPM
SHIFT_PCT = 0.96  # All LEDs light up and flash at 96% of max RPM


def build_frame(group: int, dev_id: int, cmd_id: list[int], payload: list[int]) -> bytes:
    """
    Construct a Moza protocol serial frame:
    7E | len | group | dev_id | cmd_id... | payload... | checksum
    where len = len(cmd_id) + len(payload)
    and checksum = (13 + sum(all preceding bytes)) % 256.
    """
    length = len(cmd_id) + len(payload)
    frame = [0x7E, length, group, dev_id] + cmd_id + payload
    checksum = (13 + sum(frame)) % 256
    frame.append(checksum)
    return bytes(frame)


def encode_rpm_mode(enabled: bool) -> bytes:
    """Group 63 (0x3F), cmd 4: 1 = external telemetry mode, 0 = default firmware mode."""
    return build_frame(group=0x3F, dev_id=0x00, cmd_id=[0x04], payload=[1 if enabled else 0])


def encode_rpm_leds(bitmask: int) -> bytes:
    """Group 63 (0x3F), cmd [26, 0]: 2-byte little-endian LED bitmask."""
    low = bitmask & 0xFF
    high = (bitmask >> 8) & 0xFF
    return build_frame(group=0x3F, dev_id=0x00, cmd_id=[0x1A, 0x00], payload=[low, high])


def calc_led_bitmask(
    rpm: float,
    max_rpm: float,
    num_leds: int = NUM_LEDS,
    start_pct: float = START_PCT,
    shift_pct: float = SHIFT_PCT,
    now: float = 0.0,
) -> int:
    """
    Calculate the active LED bitmask for a given RPM:
    - Below start_pct: 0 LEDs
    - Between start_pct and shift_pct: progressive fill from 1 to num_leds
    - At or above shift_pct: all LEDs flashing at ~12Hz for shift indicator
    """
    if max_rpm <= 0 or rpm <= 0:
        return 0

    pct = rpm / max_rpm
    if pct < start_pct:
        return 0

    if pct >= shift_pct:
        # Flash all LEDs at ~12 Hz (toggle every 0.08s)
        flash_on = int(now / 0.08) % 2 == 0
        return (1 << num_leds) - 1 if flash_on else 0

    ratio = (pct - start_pct) / (shift_pct - start_pct)
    active = max(1, min(num_leds, int(ratio * num_leds) + 1))
    return (1 << active) - 1


def find_moza_serial_port() -> str | None:
    """Search for Moza wheelbase CDC-ACM serial device."""
    # 1. Preferred: stable symlinks by vendor ID
    by_id = glob.glob("/dev/serial/by-id/*MOZA*") + glob.glob("/dev/serial/by-id/*Gudsen*")
    if by_id:
        return by_id[0]

    # 2. Check /sys/class/tty/ttyACM* for Moza vendor ID 346e
    for tty_dir in glob.glob("/sys/class/tty/ttyACM*"):
        dev_name = os.path.basename(tty_dir)
        dev_path = f"/dev/{dev_name}"
        # Inspect USB vendor ID
        try:
            device_symlink = os.path.join(tty_dir, "device")
            if os.path.exists(device_symlink):
                # Search up to 4 parent levels for idVendor
                curr = os.path.realpath(device_symlink)
                for _ in range(4):
                    vid_file = os.path.join(curr, "idVendor")
                    if os.path.exists(vid_file):
                        with open(vid_file) as f:
                            if "346e" in f.read().lower():
                                return dev_path
                    curr = os.path.dirname(curr)
        except OSError:
            pass

    # 3. Fallback: first ttyACM if accessible
    acm_ports = glob.glob("/dev/ttyACM*")
    if acm_ports:
        return acm_ports[0]

    return None


class MozaController:
    """Manages serial connection and LED streaming to Moza hardware."""

    def __init__(self, port: str | None = None) -> None:
        self.port_path = port
        self.fd: int | None = None
        self.last_mask: int | None = None
        self.last_packet_at: float = 0.0
        self.peak_rpm: float = 8500.0

    def open(self) -> bool:
        path = self.port_path or find_moza_serial_port()
        if not path or not os.path.exists(path):
            return False

        try:
            fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
            attrs = termios.tcgetattr(fd)
            # 115200 baud, 8N1, raw mode, no flow control
            attrs[0] = 0  # iflag: raw input
            attrs[1] = 0  # oflag: raw output
            attrs[2] |= termios.CS8 | termios.CREAD | termios.CLOCAL  # cflag: 8N1
            attrs[3] = 0  # lflag: non-canonical
            attrs[4] = termios.B115200  # ispeed
            attrs[5] = termios.B115200  # ospeed
            termios.tcsetattr(fd, termios.TCSANOW, attrs)
            self.fd = fd
            self.port_path = path

            # Hand over control of LEDs to external telemetry
            self.send_bytes(encode_rpm_mode(True))
            return True
        except (OSError, termios.error):
            if self.fd is not None:
                os.close(self.fd)
                self.fd = None
            return False

    def send_bytes(self, data: bytes) -> bool:
        if self.fd is None:
            return False
        try:
            os.write(self.fd, data)
            return True
        except OSError:
            self.close()
            return False

    def update_rpm(self, rpm: float, max_rpm: float, now: float) -> None:
        self.last_packet_at = now
        if max_rpm > 0:
            eff_max = max_rpm
        else:
            if rpm > self.peak_rpm:
                self.peak_rpm = rpm
            eff_max = max(self.peak_rpm, 6000.0)
        mask = calc_led_bitmask(rpm, eff_max, now=now)
        if mask != self.last_mask or mask > 0:
            self.send_bytes(encode_rpm_leds(mask))
            self.last_mask = mask

    def check_timeout(self, now: float) -> None:
        """Turn off LEDs if telemetry has stopped (e.g. paused/garage)."""
        if self.last_mask is not None and self.last_mask > 0 and (now - self.last_packet_at > 1.5):
            self.send_bytes(encode_rpm_leds(0))
            self.last_mask = 0
        if self.fd is not None and self.last_packet_at > 0 and (now - self.last_packet_at > 5.0):
            # Close port after 5 seconds idle so game transitions (menus/track loads) have free device access
            self.close()
            self.last_mask = None

    def close(self) -> None:
        if self.fd is not None:
            try:
                # Reset LEDs and return control to default firmware mode
                os.write(self.fd, encode_rpm_leds(0))
                os.write(self.fd, encode_rpm_mode(False))
                os.close(self.fd)
            except OSError:
                pass
            self.fd = None


def sweep_test(port: str | None = None) -> None:
    """Test LED patterns on the connected Moza wheel."""
    moza = MozaController(port)
    if not moza.open():
        print(f"idoracing-moza: could not connect to Moza device ({moza.port_path or 'not found'})")
        return
    print(f"idoracing-moza: testing LEDs on {moza.port_path}...")
    try:
        # Step 1: progressive LED fill (1 to 10)
        for i in range(1, NUM_LEDS + 1):
            mask = (1 << i) - 1
            moza.send_bytes(encode_rpm_leds(mask))
            time.sleep(0.08)
        time.sleep(0.3)
        # Step 2: flash shift lights 5 times
        for _ in range(5):
            moza.send_bytes(encode_rpm_leds((1 << NUM_LEDS) - 1))
            time.sleep(0.08)
            moza.send_bytes(encode_rpm_leds(0))
            time.sleep(0.08)
        print("idoracing-moza: test completed successfully")
    finally:
        moza.close()


def run_bridge(port: str | None = None, udp_port: int = UDP_PORT) -> None:
    moza = MozaController(port)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("127.0.0.1", udp_port))
    except OSError as err:
        print(f"idoracing-moza: cannot bind UDP port {udp_port} ({err}); another instance might be running")
        sock.close()
        return
    sock.setblocking(False)

    running = True

    def on_signal(_sig, _frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    print(f"idoracing-moza: listening on UDP 127.0.0.1:{udp_port} (waiting for telemetry to connect wheel)...")

    last_device_check = 0.0

    while running:
        now = time.time()

        # Wait for telemetry packet (up to 50ms)
        r, _, _ = select.select([sock], [], [], 0.05)
        if r:
            try:
                data, _ = sock.recvfrom(256)
                pkt = json.loads(data.decode("utf-8"))
                rpm = float(pkt.get("rpm", 0.0))
                max_rpm = float(pkt.get("max_rpm", 8500.0))
                if rpm > 0:
                    # Connect to wheel only when telemetry is actively streaming
                    if moza.fd is None and (now - last_device_check) > 2.0:
                        last_device_check = now
                        if moza.open():
                            print(f"idoracing-moza: connected to Moza on {moza.port_path}")
                    if moza.fd is not None:
                        moza.update_rpm(rpm, max_rpm, now)
                else:
                    moza.check_timeout(now)
            except (ValueError, KeyError, OSError):
                pass
        else:
            moza.check_timeout(now)

    moza.close()
    sock.close()
    print("idoracing-moza: bridge stopped cleanly")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IdoRacing Moza RPM LEDs Telemetry Bridge")
    parser.add_argument("--port", help="Serial port path (e.g. /dev/ttyACM0)")
    parser.add_argument("--udp-port", type=int, default=UDP_PORT, help="UDP telemetry port (default: 10823)")
    parser.add_argument("--test", action="store_true", help="Run a quick LED test pattern and exit")
    args = parser.parse_args()
    if args.test:
        sweep_test(port=args.port)
    else:
        run_bridge(port=args.port, udp_port=args.udp_port)
