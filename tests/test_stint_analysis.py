"""Unit tests for race stint pace and degradation analysis."""

from datetime import datetime

from analysis.stint_analysis import analyze_session_stint
from domain.session import Lap, Session


def test_stint_analysis_stable_pace():
    now = datetime.now()
    laps = [
        Lap(lap_number=1, lap_time=98.5, sector_times=[30.0, 34.0, 34.5], is_valid=True),
        Lap(lap_number=2, lap_time=98.6, sector_times=[30.1, 34.0, 34.5], is_valid=True),
        Lap(lap_number=3, lap_time=98.5, sector_times=[30.0, 34.1, 34.4], is_valid=True),
    ]
    sess = Session(
        session_id="test_stint",
        track="Valencia",
        car="Porsche 992 GT3 R",
        date=now,
        laps=laps,
        telemetry={
            "speed": [100.0],
            "throttle": [1.0],
            "brake": [0.0],
            "gear": [3],
            "lat_accel": [0.0],
            "long_accel": [0.0],
        },
    )
    res = analyze_session_stint(sess)
    assert res["valid_laps"] == 3
    assert res["degradation_type"] == "stable_pace"
    assert "Excelente" in res["consistency_rating"]


def test_stint_analysis_rear_traction_decay():
    now = datetime.now()
    # Degrading pace: S3 (traction) gets progressively worse
    laps = [
        Lap(lap_number=1, lap_time=98.0, sector_times=[30.0, 34.0, 34.0], is_valid=True),
        Lap(lap_number=2, lap_time=98.3, sector_times=[30.0, 34.0, 34.3], is_valid=True),
        Lap(lap_number=3, lap_time=98.7, sector_times=[30.1, 34.0, 34.6], is_valid=True),
        Lap(lap_number=4, lap_time=99.2, sector_times=[30.1, 34.1, 35.0], is_valid=True),
    ]
    sess = Session(
        session_id="test_stint_rear",
        track="Valencia",
        car="Porsche 992 GT3 R",
        date=now,
        laps=laps,
        telemetry={
            "speed": [100.0],
            "throttle": [1.0],
            "brake": [0.0],
            "gear": [3],
            "lat_accel": [0.0],
            "long_accel": [0.0],
        },
    )
    res = analyze_session_stint(sess)
    assert res["degradation_type"] == "rear_traction_decay"
    assert "TC1" in res["pit_wall_strategy"]
