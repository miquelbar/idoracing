from datetime import datetime
import pytest
from pydantic import ValidationError
from domain.session import Session, Lap, SessionSummary, LapComparison, CoachReport


def test_session_validation_success():
    sess = Session(
        session_id="sess_01",
        car="Porsche 911 GT3 R (992)",
        track="Ricardo Tormo de Valencia",
        date=datetime.now(),
        telemetry={
            "speed": [120.0, 130.0],
            "throttle": [0.8, 1.0],
            "brake": [0.0, 0.0],
            "gear": [3.0, 4.0],
            "lat_accel": [1.5, 1.2],
            "long_accel": [0.5, 0.6],
        },
    )
    assert sess.session_id == "sess_01"
    assert len(sess.telemetry["speed"]) == 2


def test_session_validation_missing_required_channel():
    with pytest.raises(ValidationError):
        Session(
            session_id="sess_bad",
            car="Porsche 911 GT3 R (992)",
            track="Ricardo Tormo de Valencia",
            date=datetime.now(),
            telemetry={
                "speed": [120.0, 130.0],
                # Missing throttle, brake, gear, lat_accel, long_accel
            },
        )


def test_session_summary_creation():
    summary = SessionSummary(
        session_id="sum_01",
        car="Porsche 911 GT3 R (992)",
        track="Valencia",
        date=datetime.now(),
        duration=180.5,
        best_lap_time=91.450,
        average_speed=158.4,
        lap_count=5,
    )
    assert summary.best_lap_time == 91.450
    assert summary.lap_count == 5


def test_coach_report_structure():
    report = CoachReport(
        facts=["Pérdida de 0.420s en Curva 1"],
        metrics={"delta_t": 0.420},
        hypotheses=["Frenada anticipada 20m antes del vértice"],
        exercises=["Retrasar la referencia de frenada 10m"],
        verification_indicator="Velocidad en ápice >= 140 km/h",
        confidence="Alta",
        raw_report="# Report Markdown",
    )
    assert len(report.facts) == 1
    assert report.confidence == "Alta"
