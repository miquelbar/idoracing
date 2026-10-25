"""Unit tests for Live Spotter (Pep) configuration, manifest export, and audio cues."""

import json

import pytest
from fastapi.testclient import TestClient

from analysis.spotter import get_track_slug
from analysis.tracks import get_track_length
from api.server import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_spotter_config_api(client):
    # GET default config
    res = client.get("/api/spotter/config")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "language" in data
    assert "volume" in data
    assert "toggle_key" in data
    assert "toggle_vk_code" in data

    # PUT updated config with toggle_key and toggle_vk_code
    update_payload = {
        "enabled": False,
        "language": "en",
        "volume": 75,
        "toggle_key": "F10",
        "toggle_vk_code": 121,
    }
    res_put = client.put("/api/spotter/config", json=update_payload)
    assert res_put.status_code == 200
    put_data = res_put.json()
    assert put_data["enabled"] is False
    assert put_data["language"] == "en"
    assert put_data["volume"] == 75
    assert put_data["toggle_key"] == "F10"
    assert put_data["toggle_vk_code"] == 121

    # Verify persistence via GET
    res_get2 = client.get("/api/spotter/config")
    assert res_get2.status_code == 200
    assert res_get2.json()["enabled"] is False
    assert res_get2.json()["language"] == "en"
    assert res_get2.json()["toggle_key"] == "F10"
    assert res_get2.json()["toggle_vk_code"] == 121

    # Restore to enabled = True, es, F9, 120
    client.put(
        "/api/spotter/config",
        json={"enabled": True, "language": "es", "volume": 85, "toggle_key": "F9", "toggle_vk_code": 120},
    )


def test_spotter_audio_endpoint(client):
    res_on = client.get("/api/spotter/audio/radio_on?lang=es")
    assert res_on.status_code == 200
    assert res_on.headers["content-type"].startswith("audio/ogg")
    assert len(res_on.content) > 1000

    res_turn = client.get("/api/spotter/audio/turn_1?lang=es")
    assert res_turn.status_code == 200
    assert res_turn.headers["content-type"].startswith("audio/ogg")

    res_off = client.get("/api/spotter/audio/radio_off?lang=en")
    assert res_off.status_code == 200
    assert res_off.headers["content-type"].startswith("audio/ogg")

    res_missing = client.get("/api/spotter/audio/non_existent_clip")
    assert res_missing.status_code == 404


def test_track_slug_normalization():
    assert get_track_slug("Ricardo Tormo de Valencia") == "valencia"
    assert get_track_slug("Valencia") == "valencia"
    assert get_track_slug("Circuit Ricardo Tormo") == "valencia"
    assert get_track_slug("Sebring International Raceway") == "sebring"
    assert get_track_slug("Autodromo Nazionale Monza") == "monza"


def test_comparison_exports_spotter_manifest(client, monkeypatch, tmp_path):
    # Isolate test voices output to a temporary directory so working tree assets are preserved
    test_voices_dir = tmp_path / "voices"
    monkeypatch.setattr("analysis.spotter.VOICES_DIR", test_voices_dir)

    # Ensure demo sessions are initialized
    client.get("/api/sessions")

    # Calling comparison on a session with corners must export the spotter manifest
    res = client.get("/api/comparison", params={"session_id": "synth_valencia_992_gt3"})
    assert res.status_code == 200
    resp_data = res.json()
    assert resp_data["has_telemetry"] is True
    assert len(resp_data["corners"]) >= 3

    manifest_path = test_voices_dir / "tracks" / "valencia" / "manifest.json"
    assert manifest_path.exists(), "Manifest was not exported"

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest["track_slug"] == "valencia"
    assert isinstance(manifest["pb_lap_ms"], int)
    assert isinstance(manifest["bubota_lap_ms"], int)
    assert manifest["pb_lap_ms"] > 0
    assert manifest["bubota_lap_ms"] > 0

    hotspots = manifest["hotspots"]
    assert len(hotspots) == 3

    track_len = get_track_length("Ricardo Tormo de Valencia")
    for idx, h in enumerate(hotspots):
        slot = idx + 1
        assert h["slot"] == slot
        assert h["clip_id"] == f"hotspot_{slot}"
        assert isinstance(h["corner_id"], int)
        assert isinstance(h["corner_name"], str)
        assert isinstance(h["trigger_dist_m"], (int, float))
        assert isinstance(h["corner_start_m"], (int, float))
        assert isinstance(h["corner_end_m"], (int, float))
        assert isinstance(h["target_brake_m"], int)
        assert isinstance(h["target_vmin_kmh"], (int, float))

        # Check modulo 250m trigger formula
        expected_trigger = round((h["corner_start_m"] - 250.0) % track_len, 1)
        assert abs(h["trigger_dist_m"] - expected_trigger) < 0.2

        # Check that hotspot audio clips exist on disk in both languages
        for lang in ("es", "en"):
            clip_path = test_voices_dir / "tracks" / "valencia" / lang / f"hotspot_{slot}.ogg"
            assert clip_path.exists(), f"Missing audio clip: {clip_path}"
            assert clip_path.stat().st_size > 1000, f"Audio clip {clip_path} is too small"
