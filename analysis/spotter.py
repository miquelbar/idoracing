"""
Live Spotter (Pep) integration module:
- Manages driver audio coaching configuration (data/spotter_config.json).
- Generates track spotter manifest (recorder/voices/tracks/<track_slug>/manifest.json)
  identifying the 3 critical corners where the driver loses the most time to Bubota.
- Coordinates pre-generation of bilingual audio cues (ES/EN) with walkie-talkie filter.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import TYPE_CHECKING, Any

from analysis.tracks import get_track_length
from tools.generate_pep_voices import generate_clip

if TYPE_CHECKING:
    from fastapi import BackgroundTasks

    from domain.session import CornerAnalysis

logger = logging.getLogger("pep_spotter")

ROOT_DIR = Path(__file__).resolve().parent.parent
SPOTTER_CONFIG_FILE = ROOT_DIR / "data" / "spotter_config.json"
VOICES_DIR = Path(os.environ.get("IDORACING_VOICES_DIR") or (ROOT_DIR / "recorder" / "voices"))

TRACK_SLUG_MAP: dict[str, str] = {
    "valencia": "valencia",
    "ricardo tormo": "valencia",
    "ricardo tormo de valencia": "valencia",
    "cheste": "valencia",
    "sebring": "sebring",
    "monza": "monza",
    "spa": "spa",
    "spa-francorchamps": "spa",
    "zandvoort": "zandvoort",
    "nurburgring": "nurburgring",
    "nuerburgring": "nurburgring",
}


def get_track_slug(track_name: str | None) -> str:
    """Normalize track name into a clean directory slug for voice files."""
    if not track_name:
        return "valencia"
    cleaned = track_name.lower().strip()
    for key, slug in TRACK_SLUG_MAP.items():
        if key in cleaned:
            return slug
    slug = re.sub(r"[^a-z0-9]+", "_", cleaned).strip("_")
    return slug or "track"


def load_spotter_config() -> dict[str, Any]:
    """Load spotter configuration from data/spotter_config.json, returning default if absent."""
    if SPOTTER_CONFIG_FILE.exists():
        try:
            with open(SPOTTER_CONFIG_FILE, encoding="utf-8") as f:
                data = json.load(f)
                return {
                    "enabled": bool(data.get("enabled", True)),
                    "language": "en" if str(data.get("language", "es")).lower().startswith("en") else "es",
                    "volume": max(0, min(100, int(data.get("volume", 85)))),
                    "toggle_key": str(data.get("toggle_key", "F9")).upper().strip() or "F9",
                    "toggle_vk_code": int(data.get("toggle_vk_code", 120)),
                }
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to parse spotter config %s: %s", SPOTTER_CONFIG_FILE, exc)

    default_cfg = {
        "enabled": True,
        "language": "es",
        "volume": 85,
        "toggle_key": "F9",
        "toggle_vk_code": 120,
    }
    save_spotter_config(default_cfg)
    return default_cfg


def save_spotter_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """Persist spotter configuration to data/spotter_config.json."""
    SPOTTER_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    clean_cfg = {
        "enabled": bool(cfg.get("enabled", True)),
        "language": "en" if str(cfg.get("language", "es")).lower().startswith("en") else "es",
        "volume": max(0, min(100, int(cfg.get("volume", 85)))),
        "toggle_key": str(cfg.get("toggle_key", "F9")).upper().strip() or "F9",
        "toggle_vk_code": int(cfg.get("toggle_vk_code", 120)),
    }
    with open(SPOTTER_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(clean_cfg, f, indent=2)
    return clean_cfg


async def synthesize_track_hotspots_async(track_slug: str, hotspots: list[dict[str, Any]]) -> None:
    """Asynchronously synthesize bilingual radio clips for track hotspots."""
    track_dir = VOICES_DIR / "tracks" / track_slug
    for h in hotspots:
        corner_id = h["corner_id"]
        target_brake = h["target_brake_m"]
        clip_id = h["clip_id"]
        c_name = h.get("corner_name") or f"Curva {corner_id}"

        if target_brake >= 175:
            board_es = "en el 200"
            board_en = "at the 200 board"
        elif target_brake >= 125:
            board_es = "en el 150"
            board_en = "at the 150 board"
        elif target_brake >= 75:
            board_es = "en el 100"
            board_en = "at the 100 board"
        else:
            board_es = "en el 50"
            board_en = "at the 50 board"

        scripts = {
            "es": f"{c_name}: frena {board_es}, vértice limpio y tracciona pronto.",
            "en": f"{c_name}: brake {board_en}, clean apex and early on throttle.",
        }

        for lang, text in scripts.items():
            dest_ogg = track_dir / lang / f"{clip_id}.ogg"
            dest_ogg.parent.mkdir(parents=True, exist_ok=True)
            await generate_clip(clip_id, lang, text, dest_ogg, force=False)


def synthesize_track_hotspots_sync(track_slug: str, hotspots: list[dict[str, Any]]) -> None:
    """Synchronous runner for synthesize_track_hotspots_async."""
    try:
        asyncio.run(synthesize_track_hotspots_async(track_slug, hotspots))
    except Exception as exc:  # noqa: BLE001
        logger.error("Error during background spotter audio synthesis: %s", exc)


def _schedule_hotspots_audio_generation(
    track_slug: str,
    hotspots: list[dict[str, Any]],
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Schedule audio synthesis in the background without blocking the HTTP request."""
    if background_tasks is not None:
        background_tasks.add_task(synthesize_track_hotspots_sync, track_slug, hotspots)
        return

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(synthesize_track_hotspots_async(track_slug, hotspots))
    except RuntimeError:
        threading.Thread(
            target=synthesize_track_hotspots_sync,
            args=(track_slug, hotspots),
            daemon=True,
        ).start()


def export_track_spotter_manifest(
    track_name: str,
    pb_lap_time: float,
    bubota_lap_time: float,
    corners: list[CornerAnalysis],
    background_tasks: BackgroundTasks | None = None,
) -> dict[str, Any] | None:
    """
    Identifies the top 3 corners where the driver loses the most time vs Bubota,
    saves recorder/voices/tracks/<track_slug>/manifest.json and triggers background audio synthesis.
    """
    if not corners:
        return None

    track_slug = get_track_slug(track_name)
    track_len = get_track_length(track_name)
    max_corner_dist = max((c.end_dist for c in corners if c.end_dist), default=0.0)
    if max_corner_dist > track_len:
        track_len = max_corner_dist

    # Sort corners by ideal_time_gain descending (biggest deficit vs Bubota first)
    sorted_corners = sorted(
        corners,
        key=lambda c: getattr(c, "ideal_time_gain", 0.0) or 0.0,
        reverse=True,
    )
    # Take up to 6 key corners with highest deficit, sorted sequentially around track
    top_corners = sorted(sorted_corners[:6], key=lambda c: c.start_dist)

    hotspots: list[dict[str, Any]] = []
    for i, c in enumerate(top_corners):
        slot = i + 1
        # Give ~380m lead time before corner start (~5.5s at 240 km/h) for crisp engineer call
        trigger_dist_m = round((c.start_dist - 380.0) % track_len, 1)

        apex = c.apex_dist if c.apex_dist is not None else (c.start_dist + c.end_dist) / 2.0
        bp = c.ideal_brake_point
        raw_brake = (apex - bp) if (bp is not None and bp < apex) else (apex - c.start_dist)
        target_brake_m = int(round(max(40.0, min(200.0, raw_brake))))

        vmin = c.v_min_ideal if (c.v_min_ideal and c.v_min_ideal > 0) else max(c.ref_min_speed, c.comp_min_speed, 60.0)
        target_vmin_kmh = round(float(vmin), 1)

        hotspots.append(
            {
                "slot": slot,
                "corner_id": c.corner_number,
                "corner_name": c.corner_name,
                "trigger_dist_m": trigger_dist_m,
                "corner_start_m": round(c.start_dist, 1),
                "corner_end_m": round(c.end_dist, 1),
                "target_brake_m": target_brake_m,
                "target_vmin_kmh": target_vmin_kmh,
                "clip_id": f"hotspot_{slot}",
            }
        )

    manifest = {
        "track_slug": track_slug,
        "track_length_m": round(float(track_len), 1),
        "pb_lap_ms": int(round(pb_lap_time * 1000)),
        "bubota_lap_ms": int(round(bubota_lap_time * 1000)),
        "hotspots": hotspots,
    }

    track_dir = VOICES_DIR / "tracks" / track_slug
    track_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = track_dir / "manifest.json"

    # Check if we need to regenerate audio clips
    needs_audio_gen = True
    if manifest_path.exists():
        try:
            with open(manifest_path, encoding="utf-8") as f:
                old_manifest = json.load(f)
            old_hotspots = old_manifest.get("hotspots", [])
            if len(old_hotspots) == len(hotspots):
                matches = all(
                    old_h.get("corner_id") == new_h.get("corner_id")
                    and old_h.get("target_brake_m") == new_h.get("target_brake_m")
                    for old_h, new_h in zip(old_hotspots, hotspots, strict=False)
                )
                if matches:
                    all_exist = all(
                        (track_dir / lang / f"{h['clip_id']}.ogg").exists() for h in hotspots for lang in ("es", "en")
                    )
                    if all_exist:
                        needs_audio_gen = False
        except Exception:  # noqa: BLE001
            needs_audio_gen = True

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    logger.info("Exported spotter manifest for track %s -> %s", track_slug, manifest_path)

    if needs_audio_gen:
        logger.info("Scheduling background audio generation for hotspots in %s", track_slug)
        _schedule_hotspots_audio_generation(track_slug, hotspots, background_tasks)

    return manifest
