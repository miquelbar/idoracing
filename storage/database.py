"""
SQLite database storage for ACC Coach sessions, laps, and coaching reports.
"""

from datetime import datetime
import json
import os
import sqlite3
from typing import Any, Dict, List, Optional
from domain.session import CoachReport, Lap, Session, SessionSummary

DEFAULT_DB_PATH = os.environ.get("ACC_COACH_DB_PATH", os.path.join("data", "acc_coach.db"))


class Storage:
    """Manages SQLite persistence for sessions, telemetry, and coaching feedback."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self.init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        """Create tables and indexes if they do not exist."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                car TEXT NOT NULL,
                track TEXT NOT NULL,
                date TEXT NOT NULL,
                source_file TEXT,
                best_lap_time REAL,
                duration REAL,
                average_speed REAL,
                created_at TEXT NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS laps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                lap_number INTEGER NOT NULL,
                lap_time REAL NOT NULL,
                sector_times TEXT,
                is_valid INTEGER NOT NULL,
                telemetry TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS coach_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                ref_lap INTEGER NOT NULL,
                comp_lap INTEGER NOT NULL,
                facts TEXT,
                metrics TEXT,
                hypotheses TEXT,
                exercises TEXT,
                verification_indicator TEXT,
                confidence TEXT,
                raw_report TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
            );
            """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_car ON sessions (car);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_track ON sessions (track);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions (date);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_laps_session_id ON laps (session_id);")
            conn.commit()

    def save_session(self, session: Session) -> str:
        """Persist a complete session and its laps."""
        speeds = session.telemetry.get("speed", [])
        avg_speed = float(sum(speeds) / len(speeds)) if speeds else 0.0
        duration = float(len(speeds))
        valid_laps = [l.lap_time for l in session.laps if l.is_valid and l.lap_time > 0]
        best_lap = min(valid_laps) if valid_laps else 0.0

        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Insert or replace session
            cursor.execute("""
            INSERT OR REPLACE INTO sessions (
                id, session_id, car, track, date, source_file, best_lap_time, duration, average_speed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session.id,
                session.session_id,
                session.car,
                session.track,
                session.date.isoformat(),
                session.source_file,
                best_lap,
                duration,
                avg_speed,
                datetime.now().isoformat(),
            ))

            # Delete any previous laps for this session ID
            cursor.execute("DELETE FROM laps WHERE session_id = ?", (session.id,))

            for lap in session.laps:
                telemetry_json = json.dumps(lap.telemetry) if lap.telemetry else None
                sector_json = json.dumps(lap.sector_times) if lap.sector_times else None
                cursor.execute("""
                INSERT INTO laps (session_id, lap_number, lap_time, sector_times, is_valid, telemetry)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    session.id,
                    lap.lap_number,
                    lap.lap_time,
                    sector_json,
                    1 if lap.is_valid else 0,
                    telemetry_json,
                ))

            conn.commit()
        return session.id

    def get_session(self, session_id: str) -> Optional[Session]:
        """Load full session by ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE id = ? OR session_id = ?", (session_id, session_id))
            s_row = cursor.fetchone()
            if not s_row:
                return None

            cursor.execute("SELECT * FROM laps WHERE session_id = ? ORDER BY lap_number ASC", (s_row["id"],))
            lap_rows = cursor.fetchall()

            laps: List[Lap] = []
            for lr in lap_rows:
                l_telemetry = json.loads(lr["telemetry"]) if lr["telemetry"] else None
                l_sectors = json.loads(lr["sector_times"]) if lr["sector_times"] else []
                laps.append(Lap(
                    lap_number=lr["lap_number"],
                    lap_time=lr["lap_time"],
                    sector_times=l_sectors,
                    is_valid=bool(lr["is_valid"]),
                    telemetry=l_telemetry,
                ))

            # Reconstruct session telemetry from reference lap or best lap if empty
            session_telemetry = {}
            if laps:
                for l in laps:
                    if l.telemetry:
                        session_telemetry = l.telemetry
                        break

            return Session(
                id=s_row["id"],
                session_id=s_row["session_id"],
                car=s_row["car"],
                track=s_row["track"],
                date=datetime.fromisoformat(s_row["date"]),
                telemetry=session_telemetry,
                laps=laps,
                source_file=s_row["source_file"],
            )

    def list_sessions(
        self,
        car: Optional[str] = None,
        track: Optional[str] = None,
    ) -> List[SessionSummary]:
        """List session summaries with optional filtering."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            query = """
            SELECT s.id, s.session_id, s.car, s.track, s.date, s.best_lap_time, s.duration, s.average_speed,
                   COUNT(l.id) as lap_count
            FROM sessions s
            LEFT JOIN laps l ON s.id = l.session_id
            WHERE 1=1
            """
            params: List[Any] = []
            if car:
                query += " AND s.car LIKE ?"
                params.append(f"%{car}%")
            if track:
                query += " AND s.track LIKE ?"
                params.append(f"%{track}%")

            query += " GROUP BY s.id ORDER BY s.date DESC"
            cursor.execute(query, params)
            rows = cursor.fetchall()

            summaries = []
            for r in rows:
                summaries.append(SessionSummary(
                    id=r["id"],
                    session_id=r["session_id"],
                    car=r["car"],
                    track=r["track"],
                    date=datetime.fromisoformat(r["date"]),
                    duration=float(r["duration"] or 0.0),
                    best_lap_time=float(r["best_lap_time"] or 0.0),
                    average_speed=float(r["average_speed"] or 0.0),
                    lap_count=int(r["lap_count"] or 0),
                ))
            return summaries

    def delete_session(self, session_id: str):
        """Delete session and associated laps."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM laps WHERE session_id = ?", (session_id,))
            cursor.execute("DELETE FROM sessions WHERE id = ? OR session_id = ?", (session_id, session_id))
            conn.commit()

    def save_coach_report(self, session_id: str, ref_lap: int, comp_lap: int, report: CoachReport):
        """Persist generated coaching report."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO coach_reports (
                session_id, ref_lap, comp_lap, facts, metrics, hypotheses, exercises,
                verification_indicator, confidence, raw_report, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id,
                ref_lap,
                comp_lap,
                json.dumps(report.facts),
                json.dumps(report.metrics),
                json.dumps(report.hypotheses),
                json.dumps(report.exercises),
                report.verification_indicator,
                report.confidence,
                report.raw_report,
                report.created_at.isoformat(),
            ))
            conn.commit()
