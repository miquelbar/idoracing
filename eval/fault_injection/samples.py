"""
Public MoTeC files the evaluation plants faults into. They are downloaded on first use into a cache
outside the repository and never committed: simulator telemetry is not ours to redistribute.
"""

from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from importers.moteclib.importer import MoTeCImporter

CACHE = Path(os.environ.get("IDORACING_EVAL_CACHE", Path.home() / ".cache" / "idoracing-eval"))
LD_CLI = "https://raw.githubusercontent.com/snipem/ld-cli/HEAD/testdata/"


@dataclass(frozen=True)
class Sample:
    key: str
    url: str
    base_lap: int
    noise_lap: int | None


SAMPLES = [
    Sample("lmu-bmwgt3-spa", LD_CLI + "lmu-bmwgt3-spa-q1.ld", base_lap=3, noise_lap=None),
    # Lap 0 is the race start, in traffic: usable only as the noisy half of the real-vs-real control.
    Sample("ac-tatuusfa1-spa", LD_CLI + "ac-tatuusfa1-spa.ld", base_lap=1, noise_lap=0),
]


def fetch(sample: Sample) -> Path:
    path = CACHE / f"{sample.key}.ld"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(sample.url, path)
    return path


def load(sample: Sample):
    session = MoTeCImporter(str(fetch(sample))).parse()
    laps = {lap.lap_number: lap for lap in session.laps}
    return session, laps
