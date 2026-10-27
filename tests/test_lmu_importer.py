import os
import tempfile

from importers.lmu_importer import LMUImporter


def test_lmu_importer_parsing():
    content = """<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
<RaceResults>
<TimeString>2026/10/12 15:00:00</TimeString>
<TrackVenue>Circuit de la Sarthe</TrackVenue>
<Driver>
<Name>Miquel</Name>
<VehName>Porsche 911 GT3 R LMGT3</VehName>
<isPlayer>1</isPlayer>
<Lap num="1" p="1" s1="42.500" s2="65.200" s3="85.300">193.000</Lap>
<Lap num="2" p="1" s1="41.200" s2="64.100" s3="84.700">190.000</Lap>
</Driver>
</RaceResults>
</rFactorXML>
"""
    with tempfile.TemporaryDirectory() as tmpdir:
        xml_p = os.path.join(tmpdir, "lmu_test.xml")
        with open(xml_p, "w", encoding="utf-8") as f:
            f.write(content)

        importer = LMUImporter(xml_p)
        session = importer.parse()

        assert session.track == "Circuit de la Sarthe"
        assert session.car == "Porsche 911 GT3 R LMGT3"
        assert len(session.laps) == 2
        assert session.laps[0].lap_time == 193.000
        assert session.laps[1].lap_time == 190.000
        assert session.laps[1].sector_times == [41.200, 64.100, 84.700]


def test_lmu_importer_skips_voided_laps():
    content = """<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
<RaceResults>
<TrackVenue>Sebring International Raceway</TrackVenue>
<Driver>
<Name>Miquel</Name>
<VehName>Porsche 911 GT3 R LMGT3</VehName>
<isPlayer>1</isPlayer>
<Lap num="1" et="120.5">--.----</Lap>
<Lap num="2" et="259.9">--.----</Lap>
<Lap num="3" et="407.2" s1="54.9635" s2="43.4607" s3="49.0065">147.4307</Lap>
<Lap num="4" et="520.1">--.----</Lap>
</Driver>
</RaceResults>
</rFactorXML>
"""
    with tempfile.TemporaryDirectory() as tmpdir:
        xml_p = os.path.join(tmpdir, "lmu_test.xml")
        with open(xml_p, "w", encoding="utf-8") as f:
            f.write(content)

        session = LMUImporter(xml_p).parse()

        # Voided laps ("--.----") must not become fake 139-second laps from et deltas.
        assert [(l.lap_number, l.lap_time) for l in session.laps] == [(3, 147.431)]
        assert session.laps[0].sector_times == [54.9635, 43.4607, 49.0065]


def test_lmu_importer_parses_practice_sessions_with_only_voided_laps():
    content = """<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
<RaceResults>
<TrackVenue>Algarve International Circuit</TrackVenue>
<Driver>
<Name>Miquel</Name>
<VehName>Porsche 911 GT3 R LMGT3</VehName>
<isPlayer>1</isPlayer>
<Lap num="1" et="--.---">--.----</Lap>
<Lap num="2" et="58.7323">--.----</Lap>
<Lap num="3" et="295.9164">--.----</Lap>
</Driver>
</RaceResults>
</rFactorXML>
"""
    with tempfile.TemporaryDirectory() as tmpdir:
        xml_p = os.path.join(tmpdir, "lmu_test.xml")
        with open(xml_p, "w", encoding="utf-8") as f:
            f.write(content)

        session = LMUImporter(xml_p).parse()

        # Sessions with only voided laps must not be dropped completely; they should recover elapsed deltas as outlaps
        assert session.track == "Algarve International Circuit"
        assert len(session.laps) >= 1
        assert session.laps[-1].lap_time == 237.184
        assert session.laps[-1].is_valid is False


def test_lmu_importer_filters_short_pit_deltas():
    content = """<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
<RaceResults>
<TrackVenue>Algarve International Circuit</TrackVenue>
<Driver>
<Name>Miquel</Name>
<VehName>Porsche 911 GT3 R LMGT3</VehName>
<isPlayer>1</isPlayer>
<Lap num="1" et="120.0" s1="30.0" s2="50.0" s3="67.0">147.000</Lap>
<Lap num="2" et="140.176"></Lap>
</Driver>
</RaceResults>
</rFactorXML>
"""
    with tempfile.TemporaryDirectory() as tmpdir:
        xml_p = os.path.join(tmpdir, "lmu_test.xml")
        with open(xml_p, "w", encoding="utf-8") as f:
            f.write(content)

        session = LMUImporter(xml_p).parse()

        # Lap 1 (147.0s) is valid flying lap; Lap 2 (20.176s pit delta) must NOT be valid
        assert len(session.laps) == 2
        assert session.laps[0].lap_number == 1
        assert session.laps[0].is_valid is True
        assert session.laps[1].lap_number == 2
        assert session.laps[1].lap_time == 20.176
        assert session.laps[1].is_valid is False
        assert session.laps[1].is_outlap is True


def test_resolve_lmu_session_info(monkeypatch):
    content = """<?xml version="1.0" encoding="utf-8"?>
<rFactorXML version="1.0">
<RaceResults>
<TimeString>2026/10/26 20:34:23</TimeString>
<TrackVenue>Algarve International Circuit</TrackVenue>
<Driver>
<Name>Miquel</Name>
<VehName>Porsche 911 GT3 R LMGT3</VehName>
<isPlayer>1</isPlayer>
<Lap num="1" et="100.0">--.----</Lap>
<Lap num="2" et="241.596" s1="27.8347" s2="47.2895" s3="66.4721">141.5963</Lap>
</Driver>
</RaceResults>
</rFactorXML>
"""
    with tempfile.TemporaryDirectory() as tmpdir:
        xml_p = os.path.join(tmpdir, "2026_10_26_20_34_23-26P1.xml")
        with open(xml_p, "w", encoding="utf-8") as f:
            f.write(content)

        monkeypatch.setenv("LMU_RESULTS_DIR", tmpdir)
        from datetime import datetime

        from importers.lmu_importer import resolve_lmu_session_info

        info = resolve_lmu_session_info(date_hint=datetime(2026, 10, 26, 20, 29, 48))
        assert info["track"] == "Algarve International Circuit"
        assert info["car"] == "Porsche 911 GT3 R LMGT3"
        assert info["best_lap"] == 141.596
        assert len(info["splits"]) == 3
        assert info["result_file"] == xml_p
