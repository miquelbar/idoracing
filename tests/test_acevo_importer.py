import json
from datetime import datetime

import pytest

from domain.session import Session
from importers.acevo_importer import ACEVOImporter, _parse_time_str

RESULTS = {
    "season": "Practice",
    "event": "Practice",
    "session": "Practice",
    "track": "Red Bull Ring",
    "layout": "GP Time Attack",
    "weather_type": "GameModeSelectionWeatherType_CLEAR",
    "hour": 10,
    "min": 45,
    "drivers": [
        {
            "is_current_driver": False,
            "driver_name": "Miquel",
            "car_brand": "Porsche",
            "car_name": "Porsche 911 GT2 RS Clubsport Evo (991II)",
            "laps": 2,
            "splits": ["00:25.419", "00:46.065", "00:34.185"],
            "best_lap": "01:45.669",
            "total_time": "01:45.669",
            "has_best_lap": True,
        }
    ],
}


def _write_results(tmp_path, data=RESULTS, name="261023-2150_SP_Practice.sessionresults.json"):
    path = tmp_path / name
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


def test_parse_reads_track_car_and_best_lap(tmp_path):
    session = ACEVOImporter(_write_results(tmp_path)).parse()

    assert isinstance(session, Session)
    assert session.simulator == "Assetto Corsa EVO"
    assert session.track == "Red Bull Ring"
    assert session.car == "Porsche 911 GT2 RS Clubsport Evo (991II)"
    assert session.session_id == "acevo_261023-2150_SP_Practice"
    assert session.date == datetime(2026, 10, 23, 21, 50)
    assert session.telemetry == {}
    assert len(session.laps) == 1
    lap = session.laps[0]
    assert lap.lap_number == 1
    assert lap.lap_time == pytest.approx(105.669)
    assert lap.sector_times == pytest.approx([25.419, 46.065, 34.185])
    assert lap.is_valid


def test_session_without_a_valid_lap_has_no_laps(tmp_path):
    driver = {**RESULTS["drivers"][0], "best_lap": "", "splits": []}
    session = ACEVOImporter(_write_results(tmp_path, {**RESULTS, "drivers": [driver]})).parse()

    assert session.laps == []


def test_picks_the_current_driver_over_the_first(tmp_path):
    other = {**RESULTS["drivers"][0], "car_name": "Audi R8 LMS", "best_lap": "01:50.000"}
    current = {**RESULTS["drivers"][0], "is_current_driver": True}
    session = ACEVOImporter(_write_results(tmp_path, {**RESULTS, "drivers": [other, current]})).parse()

    assert session.car == "Porsche 911 GT2 RS Clubsport Evo (991II)"


def test_rejects_files_that_are_not_session_results(tmp_path):
    path = tmp_path / "261023-2150_SP_Practice.sessionresults.json"
    path.write_text('{"foo": 1}', encoding="utf-8")

    with pytest.raises(ValueError):
        ACEVOImporter(str(path)).parse()


def test_missing_file_raises():
    with pytest.raises(FileNotFoundError):
        ACEVOImporter("nonexistent.sessionresults.json")


def test_parse_time_str():
    assert _parse_time_str("01:45.669") == pytest.approx(105.669)
    assert _parse_time_str("00:25.419") == pytest.approx(25.419)
    assert _parse_time_str("1:02:03.500") == pytest.approx(3723.5)
    assert _parse_time_str("") == 0.0
    assert _parse_time_str("--.----") == 0.0


def test_resolve_acevo_session_info(tmp_path):
    from importers.acevo_importer import resolve_acevo_session_info
    from importers.csv_importer import CSVImporter

    # Mock AC EVO prefix structure:
    # <pfx>/drive_c/users/steamuser/Saved Games/ACE/Results/261025-1408_SP_Practice.sessionresults.json
    # <pfx>/drive_c/users/steamuser/Documents/IdoRacing/recordings/acevo___20261025-140102.csv
    ace_dir = tmp_path / "drive_c" / "users" / "steamuser" / "Saved Games" / "ACE" / "Results"
    ace_dir.mkdir(parents=True)
    results_file = ace_dir / "261025-1408_SP_Practice.sessionresults.json"
    results_file.write_text(json.dumps(RESULTS), encoding="utf-8")

    rec_dir = tmp_path / "drive_c" / "users" / "steamuser" / "Documents" / "IdoRacing" / "recordings"
    rec_dir.mkdir(parents=True)
    csv_file = rec_dir / "acevo___20261025-140102.csv"
    csv_file.write_text(
        "# simulator: Assetto Corsa EVO\n"
        "# track: \n"
        "# car: \n"
        "time,lap,lap_distance,speed,throttle,brake,gear,steer_angle,rpm,lat_accel,long_accel\n"
        + "\n".join(f"{i * 0.033:.3f},1064062622,0.01,150.0,1.0,0.0,4,0.0,6000,0.5,0.1" for i in range(4000))
    )

    info = resolve_acevo_session_info(str(csv_file), datetime(2026, 10, 25, 14, 1))
    assert info["track"] == "Red Bull Ring"
    assert info["car"] == "Porsche 911 GT2 RS Clubsport Evo (991II)"

    sess = CSVImporter(str(csv_file)).parse()
    assert sess.track == "Red Bull Ring"
    assert sess.car == "Porsche 911 GT2 RS Clubsport Evo (991II)"
    assert sess.simulator == "Assetto Corsa EVO"
    assert len(sess.laps) > 0


def test_acevo_carsetup_binary_decoder(tmp_path):
    """Test decoding binary Protobuf .carsetup files from AC EVO."""
    import struct

    from importers.acevo_setup_loader import parse_carsetup_file

    def enc_varint(value: int) -> bytes:
        res = bytearray()
        while value >= 0x80:
            res.append((value & 0x7F) | 0x80)
            value >>= 7
        res.append(value & 0x7F)
        return bytes(res)

    def enc_f32(field: int, val: float) -> bytes:
        return enc_varint((field << 3) | 5) + struct.pack("<f", val)

    def enc_varint_field(field: int, val: int) -> bytes:
        return enc_varint((field << 3) | 0) + enc_varint(val)

    def enc_msg(field: int, payload: bytes) -> bytes:
        return enc_varint((field << 3) | 2) + enc_varint(len(payload)) + payload

    # Build synthetic .carsetup:
    # 1.1[0] = 55000 (front ARB)
    # 1.1[1] = 12000 (rear ARB)
    # 1.3.1 = 58.5 (brake bias)
    # 5.1 = 3 (TC1)
    # 5.2 = 4 (TC2)
    # 5.3 = 6 (ABS)
    # 6.2 = 54.0 (front ride height)
    # 6.3 = 72.0 (rear ride height)
    # 6.5 = 8.0 (rear wing)
    node_1_3 = enc_f32(1, 58.5)
    node_1 = enc_f32(1, 55000.0) + enc_f32(1, 12000.0) + enc_msg(3, node_1_3)
    node_5 = enc_varint_field(1, 3) + enc_varint_field(2, 4) + enc_varint_field(3, 6)
    node_6 = enc_f32(2, 54.0) + enc_f32(3, 72.0) + enc_f32(5, 8.0)

    setup_bytes = enc_msg(1, node_1) + enc_msg(5, node_5) + enc_msg(6, node_6)

    setup_file = tmp_path / "baseline.carsetup"
    setup_file.write_bytes(setup_bytes)

    res = parse_carsetup_file(setup_file)
    assert res is not None
    assert res["setup_file_name"] == "baseline.carsetup"
    assert res["electronics"]["tc1"] == 3
    assert res["electronics"]["tc2"] == 4
    assert res["electronics"]["abs"] == 6
    assert res["electronics"]["brake_bias"] == 58.5
    assert res["aero"]["rear_wing"] == 8.0
    assert res["aero"]["ride_height_front_mm"] == 54.0
    assert res["aero"]["ride_height_rear_mm"] == 72.0
    assert res["aero"]["rake_mm"] == 18.0
    assert res["chassis"]["arb_front"] == 55000.0
    assert res["chassis"]["arb_rear"] == 12000.0
