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

    comp_res = client.get("/api/comparison")
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert "distance" in comp_data
    assert "ref_speed" in comp_data
    assert "comp_speed" in comp_data
    assert "delta_time" in comp_data
    assert len(comp_data["corners"]) == 14


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
