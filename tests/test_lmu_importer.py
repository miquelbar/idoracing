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
