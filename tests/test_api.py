"""Unit tests for IdoRacing Analytics FastAPI endpoints."""

from datetime import datetime

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.server import app
from importers.motec_binary import create_synthetic_ld_bytes


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_api_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "operational"
    assert "version" in data


def test_api_sessions_and_comparison(client):
    res = client.get("/api/sessions")
    assert res.status_code == 200
    sessions = res.json()
    assert len(sessions) > 0

    comp_res = client.get("/api/comparison", params={"session_id": "synth_valencia_992_gt3"})
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert "distance" in comp_data
    assert "ref_speed" in comp_data
    assert "comp_speed" in comp_data
    assert "delta_time" in comp_data
    assert len(comp_data["corners"]) == 14
    assert comp_data["telemetry_source"] == "synthetic"


def test_comparison_of_unknown_session_is_404(client):
    res = client.get("/api/comparison", params={"session_id": "does-not-exist"})
    assert res.status_code == 404


LMU_RESULTS = """<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0"><RaceResults>
<TrackVenue>Circuit de la Sarthe</TrackVenue>
<Driver><Name>Driver</Name><VehName>Porsche 911 GT3 R LMGT3</VehName><isPlayer>1</isPlayer>
<Lap num="1" s1="42.5" s2="65.2" s3="85.3">193.000</Lap>
<Lap num="2" s1="41.2" s2="64.1" s3="84.7">190.000</Lap>
</Driver></RaceResults></rFactorXML>
"""


def test_lap_times_only_sessions_are_reported_as_synthetic(client):
    res = client.post("/api/import/upload", files={"file": ("lmu_race.xml", LMU_RESULTS.encode(), "text/xml")})
    assert res.status_code == 200, res.text

    comp = client.get("/api/comparison", params={"session_id": res.json()["session_id"]}).json()
    assert comp["telemetry_source"] == "synthetic"


def test_recorded_csv_laps_are_reported_as_recorded(client):
    rows = ["time,distance,speed,throttle,brake,gear,lap"]
    for lap, speed in ((1, 150), (2, 145)):
        rows += [f"{i * 0.1:.1f},{i * speed / 36:.2f},{speed},1.0,0.0,4,{lap}" for i in range(40)]
    res = client.post("/api/import/upload", files={"file": ("recorded.csv", "\n".join(rows).encode(), "text/csv")})
    assert res.status_code == 200, res.text

    comp = client.get("/api/comparison", params={"session_id": "recorded"}).json()
    assert comp["telemetry_source"] == "recorded"


def test_api_autodiscover(client):
    res = client.get("/api/autodiscover")
    assert res.status_code == 200
    data = res.json()
    assert "acc_path" in data
    assert "lmu_path" in data


def test_api_coach_chat_falls_back_to_rules_when_llm_is_silent(client, monkeypatch):
    from api.server import llm_client

    calls = []

    def silent_chat(messages, timeout=None):
        calls.append(messages)
        return None

    monkeypatch.setattr(llm_client, "chat", silent_chat)

    payload = {
        "messages": [
            {
                "role": "user",
                "content": "¿Cómo puedo optimizar la técnica de trail braking con el Porsche 911 GT3 R (992)?",
            }
        ],
        "track_name": "Ricardo Tormo de Valencia",
        "car_name": "Porsche 911 GT3 R (992)",
        "lang": "es",
    }
    res = client.post("/api/coach/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(calls) == 1
    assert data["role"] == "assistant"
    assert data["source"] == "rules"
    assert data["model"] is None
    assert "trail braking" in data["content"].lower() or "frenada" in data["content"].lower()


def test_upload_csv_creates_a_session(client):
    rows = ["time,speed,throttle,brake,gear,lap"]
    rows += [f"{i * 0.05:.2f},{100 + i},1.0,0.0,4,1" for i in range(40)]
    res = client.post(
        "/api/import/upload",
        files={"file": ("stint.csv", "\n".join(rows).encode(), "text/csv")},
    )
    assert res.status_code == 200, res.text
    assert res.json()["laps"] == 1


def test_upload_ld_creates_a_session(client):
    channels = {
        name: np.linspace(0.0, 1.0, 50, dtype=np.float32)
        for name in ("SPEED", "THROTTLE", "BRAKE", "GEAR", "G Force Lat", "G Force Long")
    }
    data = create_synthetic_ld_bytes("Driver", "BMW M4 GT3", "Monza", datetime(2026, 10, 18, 14, 0), channels)
    res = client.post("/api/import/upload", files={"file": ("monza.ld", data, "application/octet-stream")})
    assert res.status_code == 200, res.text


def test_upload_corrupt_ld_returns_400(client):
    res = client.post("/api/import/upload", files={"file": ("broken.ld", b"not motec", "application/octet-stream")})
    assert res.status_code == 400


def test_upload_unknown_extension_returns_400(client):
    res = client.post("/api/import/upload", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert res.status_code == 400


def test_lap_history_has_no_top_speed_for_synthetic_laps(client):
    res = client.get("/api/lap-history", params={"session_id": "synth_valencia_992_gt3"})
    assert res.status_code == 200
    assert all(lap["v_max"] is None for lap in res.json()["laps"])


def test_setup_endpoint_is_gone(client):
    assert client.get("/api/setup").status_code in (404, 405)


def test_car_setup_endpoint_returns_valid_data(client):
    res = client.get("/api/car-setup")
    assert res.status_code == 200
    data = res.json()
    assert "car_name" in data
    assert "track_name" in data
    assert "tyres" in data
    assert "pressures_hot" in data["tyres"]
    assert "thermal_diagnostics" in data["tyres"]
    assert "electronics" in data
    assert "brake_bias" in data["electronics"]
    assert "aero" in data
    assert "chassis" in data
    assert "setup_advice" in data
    assert len(data["setup_advice"]) > 0


def test_stint_analysis_endpoint(client):
    res = client.get("/api/stint-analysis")
    assert res.status_code == 200
    data = res.json()
    assert "pace_trend_s_per_lap" in data
    assert "degradation_type" in data
    assert "pit_wall_strategy" in data




def test_coach_report_on_lap_times_only_session_has_low_confidence(client):
    res = client.post("/api/import/upload", files={"file": ("lmu_coach.xml", LMU_RESULTS.encode(), "text/xml")})
    session_id = res.json()["session_id"]

    report = client.post(
        "/api/coach/report",
        json={"ref_lap_id": "2", "comp_lap_id": "1", "session_id": session_id, "force_refresh": True},
    ).json()

    assert report["confidence"].startswith("Baja")
    assert "Brake Bias" not in report["raw_report"]


@pytest.fixture
def restore_llm_settings():
    from api.server import llm_client

    saved = (dict(vars(llm_client)), dict(vars(llm_client.ollama)))
    yield llm_client
    vars(llm_client).update(saved[0])
    vars(llm_client.ollama).update(saved[1])


def test_changing_the_provider_url_drops_the_stored_key(client, restore_llm_settings):
    llm_client = restore_llm_settings
    llm_client.openai_api_key = "sk-test"
    llm_client.openai_base_url = "https://api.openai.com/v1"
    res = client.post(
        "/api/settings",
        json={"provider": "openai", "openai_api_key": "***", "openai_base_url": "https://elsewhere.example/v1"},
    )

    assert res.status_code == 200
    assert llm_client.openai_api_key == ""


def test_cross_origin_requests_get_no_cors_grant(client):
    res = client.options(
        "/api/settings",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in res.headers


def test_local_import_outside_simulator_folders_is_refused(client, tmp_path):
    outside = tmp_path / "secrets.csv"
    outside.write_text("time,speed\n0,1\n")
    res = client.post("/api/import/local-file", json={"filepath": str(outside)})
    assert res.status_code == 403


def test_chat_context_lists_only_the_corner_numbers_it_was_given():
    from api.server import ChatRequest, _chat_context

    req = ChatRequest(
        messages=[],
        track_name="Monza",
        car_name="BMW M4 GT3",
        selected_corner={"corner_number": 1, "name": "T1", "delta_time": 0.2, "v_min_comp": 80, "v_min_ref": 85},
    )
    context = _chat_context(req, "en")

    assert "Current track: Monza. Vehicle: BMW M4 GT3." in context
    assert "Apex minimum speed: 80.0 km/h (Ref: 85.0 km/h, ΔV: -5.0 km/h)." in context
    assert "Entry speed" not in context
    assert "Gear at apex" not in context
