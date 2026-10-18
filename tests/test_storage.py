import os
import tempfile
from domain.session import CoachReport
from importers.synthetic import create_synthetic_session
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
