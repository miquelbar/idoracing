from datetime import datetime
import os

import numpy as np
import pytest

from domain.session import Session, SessionSummary
from importers.motec_binary import create_synthetic_ld_bytes
from importers.moteclib.importer import MoTeCImporter


@pytest.fixture
def ld_file(tmp_path):
    channels = {
        "SPEED": np.array([100.0, 110.0, 120.0, 130.0], dtype=np.float32),
        "THROTTLE": np.array([0.5, 0.7, 0.9, 1.0], dtype=np.float32),
        "BRAKE": np.array([0.0, 0.2, 0.0, 0.0], dtype=np.float32),
        "GEAR": np.array([2.0, 3.0, 3.0, 4.0], dtype=np.float32),
        "G Force Lat": np.array([0.1, 0.8, 1.2, 0.3], dtype=np.float32),
        "G Force Long": np.array([0.4, -0.9, 0.2, 0.5], dtype=np.float32),
    }
    path = tmp_path / "session.ld"
    path.write_bytes(
        create_synthetic_ld_bytes(
            driver="Test Driver",
            vehicle="BMW M4 GT3",
            venue="Monza",
            date_time=datetime(2026, 10, 18, 14, 30, 0),
            channels_data=channels,
        )
    )
    return str(path)


def test_parse_reads_metadata_and_channels(ld_file):
    session = MoTeCImporter(ld_file).parse()

    assert isinstance(session, Session)
    assert session.car == "BMW M4 GT3"
    assert session.track == "Monza"
    assert session.telemetry["speed"] == pytest.approx([100.0, 110.0, 120.0, 130.0])
    assert session.telemetry["brake"] == pytest.approx([0.0, 0.2, 0.0, 0.0])


def test_corrupt_file_raises_instead_of_returning_a_session(tmp_path):
    path = tmp_path / "broken.ld"
    path.write_text("not a MoTeC file")

    with pytest.raises(Exception):
        MoTeCImporter(str(path)).parse()


def test_file_not_found():
    with pytest.raises(FileNotFoundError):
        MoTeCImporter("nonexistent_file.ld")


def test_invalid_file_extension():
    with pytest.raises(ValueError):
        MoTeCImporter("test_file.txt")


def test_session_summary(ld_file):
    summary = MoTeCImporter(ld_file).get_session_summary()

    assert isinstance(summary, SessionSummary)
    assert summary.car == "BMW M4 GT3"
    assert summary.average_speed == pytest.approx(115.0)


class _Chan:
    def __init__(self, data):
        self.data = data


def test_gps_channels_are_projected_to_local_metres(ld_file):
    importer = MoTeCImporter(ld_file)
    x, y = importer._extract_spatial_coordinates({
        "GPS_Lat": _Chan([39.485, 39.486, 39.487]),
        "GPS_Long": _Chan([-0.625, -0.624, -0.623]),
    })

    assert len(x) == 3 and len(y) == 3
    assert y[2] - y[0] == pytest.approx(222.4, abs=0.5)


def test_world_position_uses_the_flattest_axis_as_elevation(ld_file):
    importer = MoTeCImporter(ld_file)
    x, y = importer._extract_spatial_coordinates({
        "Position X": _Chan([100.0, 110.0, 120.0]),
        "Position Y": _Chan([12.0, 12.1, 12.0]),
        "Position Z": _Chan([500.0, 520.0, 540.0]),
    })

    assert x[1] == pytest.approx(0.0)
    assert y == pytest.approx([-20.0, 0.0, 20.0])


def _write_ld(path, channels, freq=20):
    path.write_bytes(
        create_synthetic_ld_bytes(
            driver="Test Driver",
            vehicle="BMW M4 GT3",
            venue="Monza",
            date_time=datetime(2026, 10, 18, 14, 30, 0),
            channels_data={k: np.asarray(v, dtype=np.float32) for k, v in channels.items()},
            freq=freq,
        )
    )


def _flat_channels(n):
    return {
        "SPEED": np.full(n, 150.0),
        "THROTTLE": np.full(n, 0.8),
        "BRAKE": np.zeros(n),
        "GEAR": np.full(n, 4.0),
        "G Force Lat": np.zeros(n),
        "G Force Long": np.zeros(n),
    }


def test_laps_are_cut_from_ldx_markers(tmp_path):
    ld = tmp_path / "stint.ld"
    _write_ld(ld, _flat_channels(1200), freq=20)
    (tmp_path / "stint.ldx").write_text(
        '<LDXFile><Layers><Layer><Markers>'
        '<Marker Time="0.0" Lap="0" />'
        '<Marker Time="25.0" Lap="1" />'
        '<Marker Time="55.0" Lap="2" />'
        '</Markers></Layer></Layers></LDXFile>'
    )

    session = MoTeCImporter(str(ld)).parse()

    assert [lap.lap_number for lap in session.laps] == [1, 2]
    lap2 = session.laps[1]
    assert lap2.lap_time == pytest.approx(30.0, abs=0.1)
    assert len(lap2.telemetry["speed"]) == pytest.approx(600, abs=2)
    assert lap2.telemetry["time"][0] == 0.0


def test_laps_are_cut_where_lap_distance_resets(tmp_path):
    n = 300
    channels = _flat_channels(n)
    channels["Lap Distance"] = np.concatenate([np.linspace(0, 4000, 100), np.linspace(0, 4000, 200)])
    ld = tmp_path / "stint.ld"
    _write_ld(ld, channels)

    session = MoTeCImporter(str(ld)).parse()

    assert len(session.laps) == 2
    assert session.laps[1].telemetry["distance"][0] == 0.0
    assert len(session.laps[1].telemetry["speed"]) == 200


def test_percent_pedals_are_rescaled_to_unit_range(tmp_path):
    channels = _flat_channels(50)
    channels["THROTTLE"] = np.full(50, 80.0)
    ld = tmp_path / "pct.ld"
    _write_ld(ld, channels)

    session = MoTeCImporter(str(ld)).parse()

    assert max(session.telemetry["throttle"]) == pytest.approx(0.8)
