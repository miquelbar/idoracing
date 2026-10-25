import os
import tempfile

import pytest

from importers.csv_importer import CSVImporter


def test_csv_importer_valid():
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "telemetry.csv")
        content = """Time,Distance,Speed,Throttle,Brake,Gear,LatAccel,LongAccel,Lap
0.0,0.0,100.0,0.5,0.0,2,0.5,0.2,1
0.5,13.8,110.0,0.8,0.0,3,0.4,0.4,1
1.0,29.1,120.0,1.0,0.0,3,0.3,0.5,1
"""
        with open(csv_path, "w") as f:
            f.write(content)

        importer = CSVImporter(csv_path)
        sess = importer.parse()

        assert sess.session_id == "telemetry"
        assert len(sess.telemetry["speed"]) == 3
        assert len(sess.laps) == 1
        assert sess.laps[0].lap_number == 1


def test_csv_importer_missing_file():
    with pytest.raises(FileNotFoundError):
        CSVImporter("nonexistent_telemetry.csv")


def test_csv_laps_start_at_zero_time_and_distance(tmp_path):
    rows = ["time,distance,speed,lap"]
    rows += [f"{i * 0.1:.1f},{i * 4.0:.1f},144,1" for i in range(30)]
    rows += [f"{i * 0.1:.1f},{i * 4.0:.1f},144,2" for i in range(30, 60)]
    csv_path = tmp_path / "two_laps.csv"
    csv_path.write_text("\n".join(rows))

    sess = CSVImporter(str(csv_path)).parse()

    assert [lap.lap_number for lap in sess.laps] == [1, 2]
    assert sess.laps[1].telemetry["time"][0] == 0.0
    assert sess.laps[1].telemetry["distance"][0] == 0.0
    assert sess.laps[1].lap_time == pytest.approx(2.9)


def test_csv_importer_setup_and_pressure_columns(tmp_path):
    rows = [
        "time,lap,lap_distance,speed,throttle,brake,gear,steer_angle,rpm,lat_accel,long_accel,yaw_rate,x,y,in_pit,lap_valid,pressure_fl,pressure_fr,pressure_rl,pressure_rr,tc,abs,brake_bias"
    ]
    for i in range(25):
        rows.append(
            f"{i * 0.1:.3f},1,{i * 10:.2f},180.0,1.0,0.0,4,0.0,7500,0.5,0.2,0.0,10.0,20.0,0,1,26.8,26.9,26.7,26.8,3.0,4.0,54.5"
        )
    csv_path = tmp_path / "acevo_setup_tel.csv"
    csv_path.write_text("\n".join(rows))

    sess = CSVImporter(str(csv_path)).parse()
    assert "pressure_fl" in sess.telemetry
    assert "tc" in sess.telemetry
    assert "abs" in sess.telemetry
    assert "brake_bias" in sess.telemetry
    assert sess.telemetry["pressure_fl"][0] == 26.8
    assert sess.telemetry["tc"][0] == 3.0
    assert sess.telemetry["abs"][0] == 4.0
    assert sess.telemetry["brake_bias"][0] == 54.5
