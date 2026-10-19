"""The IdoRacing recorder's CSV format, as written by recorder/session.go, imported end to end."""

import numpy as np
import pytest

from analysis.lap_comparison import compare_laps
from importers.csv_importer import CSVImporter

RECORDER_HEADER = (
    "# simulator: Assetto Corsa Competizione\n"
    "# track: oval\n"
    "# car: bmw_m4_gt3\n"
    "# track_length_m: 1256.6\n"
    "# recorder: idoracing-recorder 0.1.0\n"
    "time,lap,lap_distance,speed,throttle,brake,gear,steer_angle,rpm,lat_accel,long_accel,yaw_rate,x,y,in_pit,lap_valid\n"
)


def _oval_lap(lap, radius, t0, n=400):
    """
    One lap of a circle of 200 m radius driven at `radius`, so a larger radius is a wider line. Speed dips
    twice so corner detection finds two corners.
    """
    s = np.linspace(0.0, 2 * np.pi * 200.0, n, endpoint=False)
    angle = s / 200.0
    lap_length = 2 * np.pi * 200.0
    speed = 160.0 - 70.0 * (
        np.exp(-((s - lap_length / 4) ** 2) / 8000.0) + np.exp(-((s - 3 * lap_length / 4) ** 2) / 8000.0)
    )
    step = 2 * np.pi * radius / n
    times = t0 + np.concatenate([[0.0], np.cumsum(step / (speed[:-1] / 3.6))])
    rows = [
        f"{times[i]:.3f},{lap},{s[i]:.2f},{speed[i]:.2f},1.000,0.000,4,0.1000,7000,1.100,0.000,0.1000,"
        f"{radius * np.cos(angle[i]):.2f},{radius * np.sin(angle[i]):.2f},0,1\n"
        for i in range(n)
    ]
    return rows, times[-1] + step / (speed[-1] / 3.6)


def test_recorder_csv_gives_metadata_position_and_line_offsets(tmp_path):
    rows1, t = _oval_lap(1, 200.0, 0.0)
    rows2, _ = _oval_lap(2, 201.8, t)
    path = tmp_path / "acc_oval_bmw_m4_gt3_20261019-150000.csv"
    path.write_text(RECORDER_HEADER + "".join(rows1 + rows2))

    session = CSVImporter(str(path)).parse()

    assert (session.simulator, session.track, session.car) == ("Assetto Corsa Competizione", "oval", "bmw_m4_gt3")
    assert [lap.lap_number for lap in session.laps] == [1, 2]
    assert all(lap.is_valid for lap in session.laps)

    comparison = compare_laps(session.laps[0], session.laps[1], track_name=session.track)
    apex_offsets = [c.line_offset_apex_m for c in comparison.corners]
    assert len(apex_offsets) == 2
    assert all(o == pytest.approx(1.8, abs=0.2) for o in apex_offsets)


def test_laps_flagged_invalid_by_the_game_stay_invalid(tmp_path):
    rows1, t = _oval_lap(1, 200.0, 0.0)
    rows2, _ = _oval_lap(2, 200.0, t)
    rows2[10] = rows2[10].rsplit(",", 1)[0] + ",0\n"
    path = tmp_path / "acc_cut.csv"
    path.write_text(RECORDER_HEADER + "".join(rows1 + rows2))

    session = CSVImporter(str(path)).parse()

    assert [lap.is_valid for lap in session.laps] == [True, False]
