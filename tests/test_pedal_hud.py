import json
import os
import sys

# Ensure offscreen rendering for headless execution
os.environ["QT_QPA_PLATFORM"] = "offscreen"
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tools.pedal_hud import load_spotter_config, save_spotter_config


def test_spotter_config_load_and_save(tmp_path, monkeypatch):
    test_config_file = tmp_path / "spotter_config.json"
    monkeypatch.setattr("tools.pedal_hud.CONFIG_PATH", test_config_file)

    # Initial default load when file does not exist
    cfg = load_spotter_config()
    assert cfg["enabled"] is True
    assert cfg["volume"] == 85

    # Modify and save
    cfg["enabled"] = False
    cfg["volume"] = 60
    save_spotter_config(cfg)

    # Reload from disk
    loaded = load_spotter_config()
    assert loaded["enabled"] is False
    assert loaded["volume"] == 60


def test_pedal_trace_widget():
    try:
        from PySide6.QtWidgets import QApplication

        from tools.pedal_hud import PedalTraceWidget
    except ImportError:
        import pytest

        pytest.skip("PySide6 required for widget test")

    _app = QApplication.instance() or QApplication(sys.argv)
    widget = PedalTraceWidget()
    widget.resize(480, 160)

    # Initially empty
    assert len(widget.samples) == 0

    # Add samples: full throttle, then trail braking release
    widget.add_sample(gas=1.0, brake=0.0, gear=4, speed=190.0, now=10.0)
    assert widget.current_gas == 1.0
    assert widget.current_brake == 0.0

    # Mid corner trail braking
    widget.add_sample(gas=0.0, brake=0.45, gear=3, speed=120.0, now=10.5)
    assert widget.current_gas == 0.0
    assert widget.current_brake == 0.45

    # Force render to verify no exceptions in QPainter
    widget.repaint()


def test_pedal_hud_window(tmp_path, monkeypatch):
    try:
        from PySide6.QtWidgets import QApplication

        from tools.pedal_hud import PedalHudWindow
    except ImportError:
        import pytest

        pytest.skip("PySide6 required for HUD window test")

    _app = QApplication.instance() or QApplication(sys.argv)
    test_config_file = tmp_path / "spotter_config.json"
    test_config_file.write_text(json.dumps({"enabled": True, "volume": 80, "language": "es"}))
    monkeypatch.setattr("tools.pedal_hud.CONFIG_PATH", test_config_file)

    window = PedalHudWindow(udp_port=10899)

    # Check initial UI state
    assert window.spotter_config["enabled"] is True
    assert "Activo" in window.btn_pep.text()
    assert window.lbl_vol.text() == "80%"

    # Toggle radio off
    window.toggle_pep_radio()
    assert window.spotter_config["enabled"] is False
    assert "MUDO" in window.btn_pep.text()

    # Verify disk persistence
    reloaded = json.loads(test_config_file.read_text())
    assert reloaded["enabled"] is False

    # Volume controls
    window.vol_up()
    assert window.spotter_config["volume"] == 85
    assert window.lbl_vol.text() == "85%"

    window.vol_down()
    assert window.spotter_config["volume"] == 80
    assert window.lbl_vol.text() == "80%"

    # Clean close
    window.close()
