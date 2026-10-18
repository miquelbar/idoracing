import os
import unittest
from importers.moteclib.importer import MoTeCImporter
from domain.session import Session, SessionSummary, LapComparison


class TestMoTeCImporter(unittest.TestCase):
    def setUp(self):
        self.mock_file_path = "test_data/mock_session.ld"
        os.makedirs(os.path.dirname(self.mock_file_path), exist_ok=True)
        with open(self.mock_file_path, "w") as f:
            f.write("Mock MoTeC file data")

    def tearDown(self):
        if os.path.exists(self.mock_file_path):
            os.remove(self.mock_file_path)
        if os.path.exists("test_data") and not os.listdir("test_data"):
            os.rmdir("test_data")

    def test_valid_file_parsing(self):
        importer = MoTeCImporter(self.mock_file_path)
        session = importer.parse()

        # Verify the session object
        self.assertIsInstance(session, Session)
        self.assertEqual(session.car, "Porsche 911 GT3 R (992)")
        self.assertEqual(session.track, "Ricardo Tormo de Valencia")
        self.assertTrue("speed" in session.telemetry)
        self.assertTrue("throttle" in session.telemetry)
        self.assertTrue("brake" in session.telemetry)
        self.assertTrue("gear" in session.telemetry)
        self.assertTrue("lat_accel" in session.telemetry)
        self.assertTrue("long_accel" in session.telemetry)

    def test_file_not_found(self):
        with self.assertRaises(FileNotFoundError):
            importer = MoTeCImporter("nonexistent_file.ld")
            importer.parse()

    def test_invalid_file_extension(self):
        with self.assertRaises(ValueError):
            importer = MoTeCImporter("test_file.txt")
            importer.parse()

    def test_session_summary(self):
        importer = MoTeCImporter(self.mock_file_path)
        summary = importer.get_session_summary()

        self.assertIsInstance(summary, SessionSummary)
        self.assertEqual(summary.car, "Porsche 911 GT3 R (992)")
        self.assertEqual(summary.track, "Ricardo Tormo de Valencia")
        self.assertGreater(summary.duration, 0)
        self.assertGreater(summary.average_speed, 0)

    def test_lap_comparison(self):
        importer = MoTeCImporter(self.mock_file_path)
        comparison = importer.compare_laps(1, 2)

        self.assertIsInstance(comparison, LapComparison)
        self.assertEqual(comparison.reference_lap, "1")
        self.assertEqual(comparison.comparison_lap, "2")
        self.assertGreaterEqual(comparison.time_difference, 0)
        self.assertGreaterEqual(comparison.sector_differences["sector1"], 0)
        self.assertGreaterEqual(comparison.speed_differences["sector1"], 0)
        self.assertGreaterEqual(comparison.throttle_differences["sector1"], 0)
        self.assertGreaterEqual(comparison.brake_differences["sector1"], 0)
        self.assertGreaterEqual(comparison.gear_changes["sector1"], 0)

    def test_gps_and_position_channel_extraction(self):
        importer = MoTeCImporter(self.mock_file_path)

        class MockChan:
            def __init__(self, data):
                self.data = data

        # Test 1: GPS Lat/Long detection & projection
        gps_channels = {
            "GPS_Lat": MockChan([39.485, 39.486, 39.487]),
            "GPS_Long": MockChan([-0.625, -0.624, -0.623]),
        }
        x_gps, y_gps = importer._extract_spatial_coordinates(gps_channels)
        self.assertIsNotNone(x_gps)
        self.assertIsNotNone(y_gps)
        self.assertEqual(len(x_gps), 3)
        self.assertEqual(len(y_gps), 3)

        # Test 2: Cartesian Position with elevation (X, Y elevation, Z ground)
        cart_channels = {
            "Position X": MockChan([100.0, 110.0, 120.0]),
            "Position Y": MockChan([12.0, 12.1, 12.0]),     # low variance: elevation
            "Position Z": MockChan([500.0, 520.0, 540.0]),   # high variance: ground plane
        }
        x_cart, y_cart = importer._extract_spatial_coordinates(cart_channels)
        self.assertIsNotNone(x_cart)
        self.assertIsNotNone(y_cart)
        self.assertEqual(len(x_cart), 3)
        # Ground plane should use Position Z centered
        self.assertAlmostEqual(x_cart[1], 0.0)
        self.assertAlmostEqual(y_cart[1], 0.0)