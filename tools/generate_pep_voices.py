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
    # A) Estados de Radio y Conexión con el Muro
    "radio_start_guided": {
        "es": "Idò, aquí Pep en el muro. Tengo las referencias de la Bubota en pantalla. Pista libre, yo te canto las frenadas.",
        "en": "Idò, Pep on the pit wall. Bubota targets are on screen. Track is clear, I'll call your braking points.",
    },
    "radio_start_nodata": {
        "es": "Aquí Pep en el muro. Aún no tenemos referencias en este circuito. Estoy grabando telemetría: hazte un par de vueltas limpias y lo vemos luego en el box.",
        "en": "Pep on the pit wall. No baseline for this track yet. Telemetry is logging—put in a couple of clean laps and we'll review the data in the box.",
    },
    "radio_unmute_guided": {
        "es": "Te copio, radio activa. Tengo tus referencias cargadas, te voy guiando.",
        "en": "Copy that, radio active. Targets are loaded, guiding you through the lap.",
    },
    "radio_unmute_nodata": {
        "es": "Te copio, radio activa. Estamos grabando telemetría; hazte unas vueltas para coger datos y lo analizamos después.",
        "en": "Copy, radio active. Logging telemetry now—put in some laps to gather data and we'll analyze it after.",
    },
    "radio_off": {
        "es": "Copiado, Pep se va, no te molesto. Sigo grabando datos en silencio.",
        "en": "Copy that, Pep signing off, won't bother you. Still logging data in silence.",
    },
    "radio_on": {
        "es": "Te copio, radio activa. Tengo tus referencias cargadas, te voy guiando.",
        "en": "Copy that, radio active. Targets are loaded, guiding you through the lap.",
    },
    "radio_calibrating": {
        "es": "Aquí Pep en el muro. Aún no tenemos referencias en este circuito. Estoy grabando telemetría: hazte un par de vueltas limpias y lo vemos luego en el box.",
        "en": "Pep on the pit wall. No baseline for this track yet. Telemetry is logging—put in a couple of clean laps and we'll review the data in the box.",
    },
    # Avisos de salud de la grabación
    "rec_lap_aborted": {
        "es": "Has vuelto al box a media vuelta. Esta vuelta no cuenta para el análisis.",
        "en": "You returned to the garage mid-lap. This lap won't count for analysis.",
    },
    "rec_no_distance": {
        "es": "Atención, no estoy recibiendo la distancia de vuelta. La grabación no servirá para analizar curvas.",
        "en": "Heads up, I'm not getting lap distance. This recording won't work for corner analysis.",
    },
    "rec_no_sim_data": {
        "es": "He perdido la conexión con el simulador. No estoy grabando.",
        "en": "I lost the connection to the simulator. I'm not recording.",
    },
    "rec_write_failed": {
        "es": "No consigo guardar la grabación en disco. Revisa el espacio y los permisos.",
        "en": "I can't save the recording to disk. Check free space and permissions.",
    },
    # B) Evaluación de Curvas y Piques con la Bubota
    "corner_gain": {
        "es": "Buena rotación en el vértice, ahí le has recortado tiempo a la Bubota.",
        "en": "Good rotation at the apex, you just gained time on Bubota.",
    },
    "corner_overshoot": {
        "es": "Has entrado colado al vértice. Frena cinco metros antes y suelta el pedal más suave.",
        "en": "Overshot the apex. Brake five meters earlier and trail off the pedal smoother.",
    },
    "corner_early_brake": {
        "es": "Estás frenando demasiado pronto. Confía en el tren delantero y lánzate más al ápice.",
        "en": "Braking too early. Trust the front end and carry more speed to the apex.",
    },
    "bubota_roast_01": {
        "es": "Idò, la Bubota pasa por aquí a fondo mientras tú vas de paseo. Ponte las pilas.",
        "en": "Idò, Bubota flies through here while you're cruising. Step it up.",
    },
    "bubota_roast_02": {
        "es": "Te estás dejando media vida en esta salida, la Bubota ya nos saca un mundo.",
        "en": "You're leaving tenths on the table on exit, Bubota is pulling away.",
    },
    "bubota_roast_03": {
        "es": "Suelta el ancla en el vértice, que la Bubota nos está quitando las pegatinas.",
        "en": "Drop the anchor off the apex, Bubota is schooling us right now.",
    },
    # C) Paso por Meta y Neumáticos
    "lap_pb": {
        "es": "Morado en meta, vuelta rápida personal. Buen ritmo, mantén esa línea.",
        "en": "Purple at the line, personal best lap. Great pace, keep that line.",
    },
    "tyre_hot_fl": {
        "es": "Ojo con la presión delantera izquierda, vas pasado de temperatura. No arrastres el neumático en entrada.",
        "en": "Watch your front left pressure, running hot. Don't scrub the tire on entry.",
    },
    "tyre_hot_fr": {
        "es": "Ojo con la presión delantera derecha, vas pasado de temperatura. No arrastres el neumático en entrada.",
        "en": "Watch your front right pressure, running hot. Don't scrub the tire on entry.",
    },
    "tyre_hot_rl": {
        "es": "Ojo con la presión trasera izquierda, vas pasado de temperatura. No arrastres el neumático en entrada.",
        "en": "Watch your rear left pressure, running hot. Don't scrub the tire on entry.",
    },
    "tyre_hot_rr": {
        "es": "Ojo con la presión trasera derecha, vas pasado de temperatura. No arrastres el neumático en entrada.",
        "en": "Watch your rear right pressure, running hot. Don't scrub the tire on entry.",
    },
}

# Generic Turn Cues (turn_1 .. turn_20) for 100% autonomous operation without backend
for _turn_num in range(1, 21):
    PEP_SCRIPTS[f"turn_{_turn_num}"] = {
        "es": f"Atento en la curva {_turn_num}, clava la referencia de frenada y aguanta el trail braking al vértice.",
        "en": f"Focus on turn {_turn_num}, hit your braking marker and trail brake to the apex.",
    }


def _generate_fallback_audio(dest_path: Path) -> None:
    """Generate a lightweight valid OGG audio file using ffmpeg fallback or template copy."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("ffmpeg"):
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
            return
        except (subprocess.SubprocessError, OSError) as exc:
            logger.warning("ffmpeg fallback audio failed (%s); falling back to template copy", exc)

    # Secondary fallback when ffmpeg is missing (e.g. minimal CI runner):
    # copy a base OGG clip from recorder/voices if available, otherwise write dummy OGG stream
    template = Path(__file__).resolve().parent.parent / "recorder" / "voices" / "es" / "radio_on.ogg"
    if template.exists():
        shutil.copyfile(template, dest_path)
        logger.warning("Copied template audio fallback: %s", dest_path)
        return

    dest_path.write_bytes(b"OggS" + b"\x00" * 1020)
    logger.warning("Created minimal OGG fallback placeholder: %s", dest_path)


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
