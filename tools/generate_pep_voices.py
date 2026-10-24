"""
Pre-generates static bilingual audio clips (ES and EN) for Pep (Live Spotter).
Uses edge-tts with GT3 pit-wall radio effect via ffmpeg.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("pep_voices")

VOICES = {
    "es": "es-ES-AlvaroNeural",
    "en": "en-GB-RyanNeural",
}

RADIO_AUDIO_FILTER = (
    "highpass=f=200,"
    "lowpass=f=4500,"
    "equalizer=f=2800:width_type=h:width=1200:g=5,"
    "acompressor=threshold=-24dB:ratio=6:attack=5:release=40:makeup=8dB,"
    "loudnorm=I=-11:TP=-0.3:LRA=4"
)

PEP_SCRIPTS: dict[str, dict[str, str]] = {
    "radio_on": {
        "es": "Idò, Pep al habla. Te leo en el muro.",
        "en": "Idò, Pep on the radio. Reading you on the pit wall.",
    },
    "radio_off": {
        "es": "Copiado. Pep se va, no te molesto.",
        "en": "Copy that. Pep signing off, won't bother you.",
    },
    "radio_calibrating": {
        "es": "Copiado. Aún no tengo referencias de la Bubota en esta pista. Da un par de vueltas limpias para calibrar.",
        "en": "Copy. No Bubota baseline for this track yet. Run a couple of clean laps to calibrate.",
    },
    "corner_gain": {
        "es": "Buena salida, ahí le has recortado tiempo a la Bubota.",
        "en": "Good exit, you just gained time on Bubota.",
    },
    "corner_overshoot": {
        "es": "Te has colado en la entrada, suelta el freno más suave.",
        "en": "Overshot the entry, release the brake smoother.",
    },
    "corner_early_brake": {
        "es": "Has frenado pronto, confía más en el tren delantero.",
        "en": "Braked too early, trust the front end more.",
    },
    "lap_pb": {
        "es": "Vuelta rápida personal, buen ritmo. La Bubota ya suda.",
        "en": "Personal best lap, good pace. Bubota is sweating now.",
    },
    "tyre_hot_fl": {
        "es": "Presión alta en delantera izquierda.",
        "en": "High pressure on front left tyre.",
    },
    "tyre_hot_fr": {
        "es": "Presión alta en delantera derecha.",
        "en": "High pressure on front right tyre.",
    },
    "tyre_hot_rl": {
        "es": "Presión alta en trasera izquierda.",
        "en": "High pressure on rear left tyre.",
    },
    "tyre_hot_rr": {
        "es": "Presión alta en trasera derecha.",
        "en": "High pressure on rear right tyre.",
    },
    "bubota_roast_01": {
        "es": "La Bubota te ha sacado dos décimas en el vértice. ¡Métele más velocidad!",
        "en": "Bubota pulled two tenths on you through the apex. Carry more speed!",
    },
    "bubota_roast_02": {
        "es": "¿Estás esperando a que se ponga verde? La Bubota ya va por la siguiente curva.",
        "en": "Waiting for an invitation? Bubota is already at the next corner.",
    },
    "bubota_roast_03": {
        "es": "Ese vértice lo ha tomado mejor el fantasma. Abre la dirección antes.",
        "en": "The ghost took that apex way cleaner. Open up the steering earlier.",
    },
}


def _generate_fallback_audio(dest_path: Path) -> None:
    """Generate a lightweight valid OGG audio file using ffmpeg fallback."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=800:duration=0.5",
        "-af",
        f"{RADIO_AUDIO_FILTER},volume=0.5",
        "-c:a",
        "libvorbis",
        str(dest_path),
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        logger.warning("Generated fallback placeholder audio: %s", dest_path)
    except (subprocess.SubprocessError, OSError) as exc:
        logger.error("Failed to generate fallback audio %s: %s", dest_path, exc)


async def _synthesize_edge_tts(text: str, voice: str, temp_mp3: str) -> None:
    """Synthesize text into temp MP3 via edge-tts."""
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(temp_mp3)


def _apply_radio_filter(temp_mp3: str, dest_ogg: Path) -> None:
    """Process MP3 with ffmpeg applying walkie-talkie bandpass and compressor filters."""
    dest_ogg.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        temp_mp3,
        "-af",
        RADIO_AUDIO_FILTER,
        "-c:a",
        "libvorbis",
        str(dest_ogg),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


async def generate_clip(key: str, lang: str, text: str, dest_ogg: Path, force: bool = False) -> bool:
    """Generate a single audio clip with TTS and radio filter, falling back on error."""
    if dest_ogg.exists() and not force:
        logger.info("Skipping existing [%s/%s]: %s", lang, key, dest_ogg.name)
        return True

    voice = VOICES.get(lang, VOICES["es"])
    temp_dir = tempfile.mkdtemp(prefix="pep_voice_")
    temp_mp3 = os.path.join(temp_dir, f"{key}_{lang}.mp3")

    try:
        logger.info("Generating [%s/%s] -> %s", lang, key, text)
        await _synthesize_edge_tts(text, voice, temp_mp3)
        _apply_radio_filter(temp_mp3, dest_ogg)
        logger.info(
            "Successfully generated [%s/%s]: %s (%.1f KB)", lang, key, dest_ogg.name, dest_ogg.stat().st_size / 1024
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("TTS failed for [%s/%s] (%s). Generating fallback audio.", lang, key, exc)
        _generate_fallback_audio(dest_ogg)
        return False
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


async def generate_all_voices(output_dir: Path, langs: list[str], force: bool = False) -> None:
    """Generate all Pep voice clips for selected languages."""
    if not shutil.which("ffmpeg"):
        logger.error("ffmpeg is not installed or not in PATH! Cannot process audio.")
        sys.exit(1)

    total = len(PEP_SCRIPTS) * len(langs)
    logger.info("Pre-generating %d Pep voice clips into %s...", total, output_dir)

    success_count = 0
    for lang in langs:
        lang_dir = output_dir / lang
        lang_dir.mkdir(parents=True, exist_ok=True)

        for key, translations in PEP_SCRIPTS.items():
            text = translations.get(lang)
            if not text:
                continue
            dest_ogg = lang_dir / f"{key}.ogg"
            ok = await generate_clip(key, lang, text, dest_ogg, force=force)
            if ok:
                success_count += 1

    logger.info("Completed voice generation: %d/%d clips ready in %s", success_count, total, output_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-generate static radio voice clips for Pep.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "recorder" / "voices",
        help="Directory to save generated voices",
    )
    parser.add_argument(
        "--lang",
        choices=["es", "en", "all"],
        default="all",
        help="Language to generate (default: all)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing files",
    )
    args = parser.parse_args()

    langs = ["es", "en"] if args.lang == "all" else [args.lang]
    asyncio.run(generate_all_voices(args.output_dir, langs, force=args.force))


if __name__ == "__main__":
    main()
