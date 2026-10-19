import os
import tempfile
from datetime import datetime

import numpy as np
import pytest

from importers.motec_binary import (
    MoTeCLDParser,
    MoTeCLDXParser,
    create_synthetic_ld_bytes,
)


def test_synthetic_ld_generation_and_parsing():
    with tempfile.TemporaryDirectory() as tmpdir:
        ld_path = os.path.join(tmpdir, "test.ld")

        # Create synthetic channels
        channels = {
            "SPEED": np.array([100.0, 110.0, 120.0, 130.0], dtype=np.float32),
            "THROTTLE": np.array([0.5, 0.7, 0.9, 1.0], dtype=np.float32),
            "BRAKE": np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32),
            "GEAR": np.array([2.0, 3.0, 3.0, 4.0], dtype=np.float32),
        }

        b = create_synthetic_ld_bytes(
            driver="Test Driver",
            vehicle="Porsche 911 GT3 R (992)",
            venue="Ricardo Tormo de Valencia",
            date_time=datetime(2026, 10, 18, 14, 30, 0),
            channels_data=channels,
        )

        with open(ld_path, "wb") as f:
            f.write(b)

        # Parse with MoTeCLDParser
        parser = MoTeCLDParser(ld_path).parse()

        assert parser.driver == "Test Driver"
        assert parser.vehicle == "Porsche 911 GT3 R (992)"
        assert parser.venue == "Ricardo Tormo de Valencia"
        assert "SPEED" in parser.channels
        assert len(parser.channels["SPEED"].data) == 4
        assert np.isclose(parser.channels["SPEED"].data[0], 100.0)
        assert np.isclose(parser.channels["SPEED"].data[-1], 130.0)


def test_corrupted_ld_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        ld_path = os.path.join(tmpdir, "corrupt.ld")
        with open(ld_path, "wb") as f:
            f.write(b"NOT_A_VALID_MOTEC_HEADER")

        with pytest.raises(ValueError):
            MoTeCLDParser(ld_path).parse()


def test_empty_ld_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        ld_path = os.path.join(tmpdir, "empty.ld")
        with open(ld_path, "wb") as f:
            f.write(b"")

        with pytest.raises(ValueError):
            MoTeCLDParser(ld_path).parse()


def test_ldx_marker_parsing():
    with tempfile.TemporaryDirectory() as tmpdir:
        ldx_path = os.path.join(tmpdir, "test.ldx")
        content = """<?xml version="1.0" encoding="UTF-8"?>
<LDXFile Version="1.6" Creator="MoTeC i2 Pro">
  <Layers>
    <Layer Type="Lap Marker">
      <Markers>
        <Marker Time="0.000" Distance="0.0" Lap="0" Type="B" Name="Start" />
        <Marker Time="91.450" Distance="4005.0" Lap="1" Type="L" Name="Lap 1" />
        <Marker Time="182.900" Distance="8010.0" Lap="2" Type="L" Name="Lap 2" />
      </Markers>
    </Layer>
  </Layers>
</LDXFile>
"""
        with open(ldx_path, "w", encoding="utf-8") as f:
            f.write(content)

        parser = MoTeCLDXParser(ldx_path).parse()
        assert len(parser.laps) == 2
        assert parser.laps[0]["lap_number"] == 1
        assert np.isclose(parser.laps[0]["lap_time"], 91.450)
        assert parser.laps[1]["lap_number"] == 2
        assert np.isclose(parser.laps[1]["lap_time"], 91.450)
