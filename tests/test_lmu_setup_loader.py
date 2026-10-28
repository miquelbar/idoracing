"""Tests for Le Mans Ultimate .svm setup file loader."""

import tempfile
from pathlib import Path

from importers.lmu_setup_loader import (
    _match_lmu_track_dir,
    load_lmu_setup,
    parse_svm_file,
)

SAMPLE_SVM = """
VehicleClassSetting="GT3 Porsche_911_GT3_R_LMGT3 WEC2026"
UpgradeSetting=(266370,0,0,0)

[GENERAL]
FuelSetting=90//0.91

[FRONTWING]
FWSetting=0//Standard

[REARWING]
RWSetting=6//12.3 deg

[SUSPENSION]
FrontAntiSwaySetting=6//P6
RearAntiSwaySetting=2//P2
FrontToeInSetting=13//-0.188 deg
RearToeInSetting=17//0.063 deg

[CONTROLS]
RearBrakeSetting=37//47.8:52.2
TractionControlMapSetting=6//6
TCPowerCutMapSetting=6//6
TCSlipAngleMapSetting=8//8
AntilockBrakeSystemMapSetting=9//9 (Understeer)

[ENGINE]
EngineMixtureSetting=1//Race

[DRIVELINE]
DiffPreloadSetting=100//150 Nm

[FRONTLEFT]
CamberSetting=24//-2.0 deg
PressureSetting=0//136 kPa
RideHeightSetting=1//5.1 cm

[FRONTRIGHT]
CamberSetting=24//-2.0 deg
PressureSetting=0//136 kPa
RideHeightSetting=1//5.1 cm

[REARLEFT]
CamberSetting=29//-1.5 deg
PressureSetting=0//136 kPa
RideHeightSetting=17//6.7 cm

[REARRIGHT]
CamberSetting=29//-1.5 deg
PressureSetting=0//136 kPa
RideHeightSetting=17//6.7 cm
"""


def test_parse_svm_file():
    with tempfile.NamedTemporaryFile("w", suffix=".svm", delete=False) as f:
        f.write(SAMPLE_SVM)
        f_path = Path(f.name)

    try:
        sections = parse_svm_file(f_path)
        assert "CONTROLS" in sections
        assert "SUSPENSION" in sections
        assert "REARWING" in sections
        assert sections["CONTROLS"]["TractionControlMapSetting"] == ("6", "6")
        assert sections["CONTROLS"]["RearBrakeSetting"] == ("37", "47.8:52.2")
        assert sections["FRONTLEFT"]["CamberSetting"] == ("24", "-2.0 deg")
        assert sections["REARLEFT"]["RideHeightSetting"] == ("17", "6.7 cm")
    finally:
        f_path.unlink(missing_ok=True)


def test_match_lmu_track_dir():
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        (root / "Portimao").mkdir()
        (root / "Circuit Of The Americas").mkdir()

        # Algarve alias
        assert _match_lmu_track_dir(root, "Algarve International Circuit") == root / "Portimao"
        assert _match_lmu_track_dir(root, "portimao") == root / "Portimao"
        # COTA alias
        assert _match_lmu_track_dir(root, "Circuit of the Americas") == root / "Circuit Of The Americas"
        assert _match_lmu_track_dir(root, "COTA") == root / "Circuit Of The Americas"
        # Unknown track
        assert _match_lmu_track_dir(root, "Nonexistent Track") is None


def test_load_lmu_setup_full(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        portimao_dir = root / "Portimao"
        portimao_dir.mkdir()

        setup_file = portimao_dir / "GT3_992GT3R_Balanced_Portimao.svm"
        setup_file.write_text(SAMPLE_SVM, encoding="utf-8")

        monkeypatch.setenv("LMU_SETUPS_DIR", str(root))

        res = load_lmu_setup("Porsche 911 GT3 R LMGT3", "Algarve International Circuit")
        assert res is not None
        assert res["has_garage_setup"] is True
        assert res["setup_source"] == "actual_file"
        assert res["setup_file_name"] == "GT3_992GT3R_Balanced_Portimao.svm"

        elec = res["electronics"]
        assert elec["tc1"] == 6
        assert elec["tc2"] == 6
        assert elec["abs"] == 9
        assert elec["brake_bias"] == 47.8
        assert elec["ecu_map"] == 1

        aero = res["aero"]
        assert aero["front_splitter"] == 0
        assert aero["rear_wing"] == 6
        assert aero["ride_height_front_mm"] == 51.0
        assert aero["ride_height_rear_mm"] == 67.0
        assert aero["rake_mm"] == 16.0

        chassis = res["chassis"]
        assert chassis["arb_front"] == 6
        assert chassis["arb_rear"] == 2
        assert chassis["camber_front_deg"] == -2.0
        assert chassis["camber_rear_deg"] == -1.5
        assert chassis["toe_front_deg"] == -0.19
        assert chassis["toe_rear_deg"] == 0.06
        assert chassis["preload_diff_nm"] == 150

        cold_pressures = res["tyres"]["pressures_cold"]
        assert cold_pressures["FL"] == 19.7
        assert cold_pressures["RR"] == 19.7


def test_load_lmu_setup_missing(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp_dir:
        monkeypatch.setenv("LMU_SETUPS_DIR", tmp_dir)
        res = load_lmu_setup("Ferrari 499P", "Nonexistent Track")
        assert res is None


def test_load_lmu_setup_temporal_filter(monkeypatch):
    """Verifies that setups created after the session ended are ignored (temporal causality)."""
    import os
    from datetime import datetime

    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        portimao_dir = root / "Portimao"
        portimao_dir.mkdir()

        setup_old = portimao_dir / "Old_Setup.svm"
        setup_old.write_text(SAMPLE_SVM.replace("12.3 deg", "10.0 deg"), encoding="utf-8")
        os.utime(setup_old, (1000000, 1000000))

        setup_new = portimao_dir / "Future_Setup.svm"
        setup_new.write_text(SAMPLE_SVM.replace("12.3 deg", "15.0 deg"), encoding="utf-8")
        os.utime(setup_new, (2000000, 2000000))

        monkeypatch.setenv("LMU_SETUPS_DIR", str(root))

        # Session at t=1500000 (after setup_old, before setup_new)
        session_dt = datetime.fromtimestamp(1500000)
        res = load_lmu_setup("Porsche 911 GT3 R LMGT3", "Portimao", session_date=session_dt)
        assert res is not None
        assert res["setup_file_name"] == "Old_Setup.svm"
        assert res["available_setups"] == ["Future_Setup.svm", "Old_Setup.svm"]

        # Session at t=500000 (before ANY setup existed) -> Rule 2 honest None!
        session_pre = datetime.fromtimestamp(500000)
        res_pre = load_lmu_setup("Porsche 911 GT3 R LMGT3", "Portimao", session_date=session_pre)
        assert res_pre is None


def test_load_lmu_setup_telemetry_match(monkeypatch):
    """Verifies that candidate setup is matched against recorded session telemetry."""
    from datetime import datetime

    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        portimao_dir = root / "Portimao"
        portimao_dir.mkdir()

        svm_478 = SAMPLE_SVM
        svm_520 = SAMPLE_SVM.replace("RearBrakeSetting=37//47.8:52.2", "RearBrakeSetting=50//52.0:48.0")

        f1 = portimao_dir / "Setup_478.svm"
        f1.write_text(svm_478, encoding="utf-8")

        f2 = portimao_dir / "Setup_520.svm"
        f2.write_text(svm_520, encoding="utf-8")

        monkeypatch.setenv("LMU_SETUPS_DIR", str(root))

        session_dt = datetime.now()
        # Telemetry recorded brake_bias = 52.0
        telem = {"brake_bias": [52.0, 52.0, 52.0]}
        res = load_lmu_setup("Porsche 911 GT3 R LMGT3", "Portimao", session_date=session_dt, session_telemetry=telem)
        assert res is not None
        assert res["setup_file_name"] == "Setup_520.svm"
        assert res["electronics"]["brake_bias"] == 52.0


def test_load_lmu_setup_trace_log_match(monkeypatch):
    """Verifies that simulator trace_*.txt resolves the exact setup loaded by the game engine."""
    from datetime import datetime

    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        settings_dir = root / "Settings"
        log_dir = root / "Log"
        settings_dir.mkdir()
        log_dir.mkdir()

        portimao_dir = settings_dir / "Portimao"
        portimao_dir.mkdir()

        target_svm = portimao_dir / "ExactSessionSetup.svm"
        target_svm.write_text(SAMPLE_SVM, encoding="utf-8")

        other_svm = portimao_dir / "OtherSetup.svm"
        other_svm.write_text(SAMPLE_SVM, encoding="utf-8")

        session_dt = datetime.now()
        trace_file = log_dir / "trace_current.txt"
        trace_content = (
            "83.68s garageLoad.c 1608: Requested Setup: default for Vehicle Manthey DK Engineering 2026 #91:LM & Track PORTIMAOWEC. "
            "Found setup: ExactSessionSetup.svm\n"
        )
        trace_file.write_text(trace_content, encoding="utf-8")

        monkeypatch.setenv("LMU_SETUPS_DIR", str(settings_dir))
        monkeypatch.setenv("LMU_LOG_DIR", str(log_dir))

        res = load_lmu_setup("Manthey DK Engineering 2026 #91:LM", "Portimao", session_date=session_dt)
        assert res is not None
        assert res["setup_file_name"] == "ExactSessionSetup.svm"
        assert res["match_method"] == "trace_log"


def test_load_lmu_setup_explicit_selection(monkeypatch):
    """Verifies that an explicitly requested setup file is loaded and marked user_selected."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        portimao_dir = root / "Portimao"
        portimao_dir.mkdir()

        (portimao_dir / "Setup_A.svm").write_text(SAMPLE_SVM, encoding="utf-8")
        (portimao_dir / "Setup_B.svm").write_text(SAMPLE_SVM.replace("12.3 deg", "14.5 deg"), encoding="utf-8")

        monkeypatch.setenv("LMU_SETUPS_DIR", str(root))

        res = load_lmu_setup("Porsche 911 GT3 R LMGT3", "Portimao", explicit_file_name="Setup_B.svm")
        assert res is not None
        assert res["setup_file_name"] == "Setup_B.svm"
        assert res["match_method"] == "user_selected"
        assert res["aero"]["rear_wing"] == 6
