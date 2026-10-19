import os
import tempfile

from analysis.demo_session import create_synthetic_session
from domain.session import CoachReport
from storage.database import Storage


def test_storage_lifecycle():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_coach.db")
        store = Storage(db_path)

        # 1. Save session
        session = create_synthetic_session()
        saved_id = store.save_session(session)
        assert saved_id == session.id

        # 2. List sessions
        summaries = store.list_sessions()
        assert len(summaries) == 1
        assert summaries[0].car == "Porsche 911 GT3 R (992)"
        assert summaries[0].track == "Ricardo Tormo de Valencia"
        assert summaries[0].lap_count == 3

        # 3. Retrieve session
        retrieved = store.get_session(saved_id)
        assert retrieved is not None
        assert retrieved.session_id == session.session_id
        assert len(retrieved.laps) == 3

        # 4. Filter sessions
        filtered_valencia = store.list_sessions(track="Valencia")
        assert len(filtered_valencia) == 1

        filtered_monza = store.list_sessions(track="Monza")
        assert len(filtered_monza) == 0

        # 5. Coach report persistence
        report = CoachReport(
            facts=["Fact 1"],
            metrics={"m": 1},
            hypotheses=["Hypothesis 1"],
            exercises=["Exercise 1"],
            verification_indicator="Speed > 100",
            confidence="Alta",
            raw_report="# Report",
        )
        store.save_coach_report(saved_id, 2, 3, report)

        # 6. Delete session
        store.delete_session(saved_id)
        assert len(store.list_sessions()) == 0


def test_existing_databases_get_their_generated_laps_flagged(tmp_path):
    import json
    import sqlite3

    db_path = str(tmp_path / "old.db")
    conn = sqlite3.connect(db_path)
    conn.executescript("""
    CREATE TABLE sessions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, car TEXT NOT NULL, track TEXT NOT NULL,
        date TEXT NOT NULL, source_file TEXT, best_lap_time REAL, duration REAL, average_speed REAL, created_at TEXT NOT NULL);
    CREATE TABLE laps (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, lap_number INTEGER NOT NULL,
        lap_time REAL NOT NULL, sector_times TEXT, is_valid INTEGER NOT NULL, telemetry TEXT);
    INSERT INTO sessions VALUES ('a', 'lmu_race', 'car', 'track', '2026-10-01T10:00:00', '/x/race.xml', 90, 0, 0, '2026-10-01T10:00:00');
    INSERT INTO sessions VALUES ('b', 'stint', 'car', 'track', '2026-10-01T10:00:00', '/x/stint.ld', 90, 0, 0, '2026-10-01T10:00:00');
    """)
    trace = json.dumps({ch: [1.0] for ch in ("speed", "throttle", "brake", "gear", "lat_accel", "long_accel")})
    conn.execute(
        "INSERT INTO laps (session_id, lap_number, lap_time, is_valid, telemetry) VALUES ('a', 1, 90, 1, ?)", (trace,)
    )
    conn.execute(
        "INSERT INTO laps (session_id, lap_number, lap_time, is_valid, telemetry) VALUES ('b', 1, 90, 1, ?)", (trace,)
    )
    conn.commit()
    conn.close()

    store = Storage(db_path)

    assert store.get_session("lmu_race").laps[0].synthetic is True
    assert store.get_session("stint").laps[0].synthetic is False
    assert store.get_session("lmu_race").simulator == "Le Mans Ultimate"
    assert store.get_session("stint").simulator is None
