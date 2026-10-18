"""Unit tests for SimCoach FastAPI endpoints."""

from fastapi.testclient import TestClient
from api.server import app

client = TestClient(app)


def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "operational"
    assert "version" in data


def test_api_sessions_and_comparison():
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


def test_api_autodiscover():
    res = client.get("/api/autodiscover")
    assert res.status_code == 200
    data = res.json()
    assert "acc_path" in data
    assert "lmu_path" in data
