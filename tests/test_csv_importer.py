import os
import tempfile
import pytest
from importers.csv_importer import CSVImporter


def test_csv_importer_valid():
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "telemetry.csv")
        content = """Time,Distance,Speed,Throttle,Brake,Gear,LatAccel,LongAccel,Lap
0.0,0.0,100.0,0.5,0.0,2,0.5,0.2,1
0.5,13.8,110.0,0.8,0.0,3,0.4,0.4,1
1.0,29.1,120.0,1.0,0.0,3,0.3,0.5,1
"""
        with open(csv_path, "w") as f:
            f.write(content)

        importer = CSVImporter(csv_path)
        sess = importer.parse()

        assert sess.session_id == "telemetry"
        assert len(sess.telemetry["speed"]) == 3
        assert len(sess.laps) == 1
        assert sess.laps[0].lap_number == 1


def test_csv_importer_missing_file():
    with pytest.raises(FileNotFoundError):
        CSVImporter("nonexistent_telemetry.csv")
