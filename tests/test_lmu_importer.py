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
