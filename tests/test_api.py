"""Unit tests for IdoRacing Analytics FastAPI endpoints."""

import pytest
from fastapi.testclient import TestClient

from api.server import app


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
