"""
SQLite storage for IdoRacing sessions, laps and coaching reports.
"""

import json
import os
import sqlite3
from datetime import datetime
from typing import Any

from domain.session import CoachReport, Lap, Session, SessionSummary, normalize_car_name, normalize_track_name


class Storage:
    """Manages SQLite persistence for sessions, telemetry, and coaching feedback."""

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or os.environ.get("IDORACING_DB_PATH") or os.path.join("data", "idoracing.db")
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

            session_columns = {row["name"] for row in cursor.execute("PRAGMA table_info(sessions)")}
            if "simulator" not in session_columns:
                cursor.execute("ALTER TABLE sessions ADD COLUMN simulator TEXT")
                cursor.execute("UPDATE sessions SET simulator = 'Le Mans Ultimate' WHERE source_file LIKE '%.xml'")

            lap_columns = {row["name"] for row in cursor.execute("PRAGMA table_info(laps)")}
            if "synthetic" not in lap_columns:
                cursor.execute("ALTER TABLE laps ADD COLUMN synthetic INTEGER NOT NULL DEFAULT 0")
                # Older versions stored generated traces for LMU results and the demo without marking them.
                cursor.execute("""
                UPDATE laps SET synthetic = 1
                WHERE telemetry IS NOT NULL AND session_id IN (
                    SELECT id FROM sessions WHERE source_file LIKE '%.xml' OR session_id LIKE 'synth_%'
                )
                """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_car ON sessions (car);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_track ON sessions (track);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions (date);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_laps_session_id ON laps (session_id);")

            # Canonical normalization of existing vehicle and circuit aliases
            cursor.execute("""
            UPDATE sessions SET car = 'Porsche 911 GT3 R (992)'
            WHERE LOWER(car) IN ('porsche_992_gt3_r', 'porsche_911_gt3_r_992', '992 gt3 r', 'porsche 992 gt3 r', 'porsche 911 gt3 r')
            """)
            cursor.execute("""
            UPDATE sessions SET track = 'Ricardo Tormo de Valencia'
            WHERE LOWER(track) IN ('valencia', 'ricardo tormo', 'circuit ricardo tormo', 'cheste')
            """)
            conn.commit()

    def save_session(self, session: Session) -> str:
        """Persist a complete session and its laps."""
        session.car = normalize_car_name(session.car)
        session.track = normalize_track_name(session.track)
        speeds = session.telemetry.get("speed", [])
        avg_speed = float(sum(speeds) / len(speeds)) if speeds else 0.0
        duration = float(len(speeds))
        valid_laps = [l.lap_time for l in session.laps if l.is_valid and l.lap_time > 0]
        best_lap = min(valid_laps) if valid_laps else 0.0

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM sessions WHERE session_id = ?", (session.session_id,))
            existing = cursor.fetchone()
            if existing:
                session.id = existing["id"]
                # Clean up old laps for this session before inserting new ones
                cursor.execute("DELETE FROM laps WHERE session_id = ?", (session.id,))

            # Insert or replace session
            cursor.execute(
                """
            INSERT OR REPLACE INTO sessions (
                id, session_id, car, track, date, source_file, best_lap_time, duration, average_speed, created_at,
                simulator
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
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
                    session.simulator,
                ),
            )

            # Delete any previous laps for this session ID
            cursor.execute("DELETE FROM laps WHERE session_id = ?", (session.id,))

            for lap in session.laps:
                telemetry_json = json.dumps(lap.telemetry) if lap.telemetry else None
                sector_json = json.dumps(lap.sector_times) if lap.sector_times else None
                cursor.execute(
                    """
                INSERT INTO laps (session_id, lap_number, lap_time, sector_times, is_valid, telemetry, synthetic)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        session.id,
                        lap.lap_number,
                        lap.lap_time,
                        sector_json,
                        1 if lap.is_valid else 0,
                        telemetry_json,
                        1 if lap.synthetic else 0,
                    ),
                )

            conn.commit()
        return session.id

    def get_session(self, session_id: str) -> Session | None:
        """Load full session by ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE id = ? OR session_id = ?", (session_id, session_id))
            s_row = cursor.fetchone()
            if not s_row:
                return None

            is_demo = str(s_row["session_id"]).startswith("synth_")
            cursor.execute("SELECT * FROM laps WHERE session_id = ? ORDER BY lap_number ASC", (s_row["id"],))
            lap_rows = cursor.fetchall()

            laps: list[Lap] = []
            from importers.laps import truncate_teleport_jumps

            for lr in lap_rows:
                l_telemetry = json.loads(lr["telemetry"]) if lr["telemetry"] else None
                l_telemetry, is_inc = truncate_teleport_jumps(l_telemetry)
                l_sectors = json.loads(lr["sector_times"]) if lr["sector_times"] else []
                is_syn = bool(lr["synthetic"])
                has_tel = bool(l_telemetry and l_telemetry.get("speed") and (is_demo or not is_syn))
                laps.append(
                    Lap(
                        lap_number=lr["lap_number"],
                        lap_time=lr["lap_time"],
                        sector_times=l_sectors,
                        is_valid=bool(lr["is_valid"]) and not is_inc,
                        is_incomplete=is_inc,
                        telemetry=l_telemetry,
                        synthetic=is_syn,
                        has_telemetry=has_tel,
                    )
                )

            # Reconstruct session telemetry from reference lap or best lap if empty
            session_telemetry = {}
            if laps:
                for l in laps:
                    if l.telemetry and (is_demo or not l.synthetic):
                        session_telemetry = l.telemetry
                        break

            return Session(
                id=s_row["id"],
                session_id=s_row["session_id"],
                car=normalize_car_name(s_row["car"]),
                track=normalize_track_name(s_row["track"]),
                date=datetime.fromisoformat(s_row["date"]),
                telemetry=session_telemetry,
                laps=laps,
                source_file=s_row["source_file"],
                simulator=s_row["simulator"],
            )

    def list_sessions(
        self,
        car: str | None = None,
        track: str | None = None,
    ) -> list[SessionSummary]:
        """List session summaries with optional filtering."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            query = """
            SELECT s.id, s.session_id, s.car, s.track, s.date, s.best_lap_time, s.duration, s.average_speed,
                   s.simulator, s.source_file, COUNT(l.id) as lap_count
            FROM sessions s
            LEFT JOIN laps l ON s.id = l.session_id
            WHERE 1=1
            """
            params: list[Any] = []
            if car:
                query += " AND (s.car LIKE ? OR s.car LIKE ?)"
                params.extend([f"%{car}%", f"%{normalize_car_name(car)}%"])
            if track:
                query += " AND (s.track LIKE ? OR s.track LIKE ?)"
                params.extend([f"%{track}%", f"%{normalize_track_name(track)}%"])

            query += " GROUP BY s.session_id ORDER BY s.date DESC"
            cursor.execute(query, params)
            rows = cursor.fetchall()

            summaries = []
            for r in rows:
                sid = str(r["session_id"])
                is_demo = sid.startswith("synth_")
                src = str(r["source_file"] or "").lower()
                is_times_only = (
                    src.endswith(".xml")
                    or src.endswith(".json")
                    or (float(r["duration"] or 0.0) <= 0.0 and not is_demo)
                )
                summaries.append(
                    SessionSummary(
                        id=r["id"],
                        session_id=sid,
                        car=normalize_car_name(r["car"]),
                        track=normalize_track_name(r["track"]),
                        date=datetime.fromisoformat(r["date"]),
                        duration=float(r["duration"] or 0.0),
                        best_lap_time=float(r["best_lap_time"] or 0.0),
                        average_speed=float(r["average_speed"] or 0.0),
                        lap_count=int(r["lap_count"] or 0),
                        simulator=r["simulator"],
                        has_telemetry=not is_times_only,
                        is_demo=is_demo,
                    )
                )
            return summaries

    def delete_session(self, session_id: str):
        """Delete session and associated laps."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM laps WHERE session_id = ?", (session_id,))
            cursor.execute("DELETE FROM sessions WHERE id = ? OR session_id = ?", (session_id, session_id))
            conn.commit()

    def get_lap_summaries(self, session_id: str) -> list[dict[str, Any]]:
        """Lap metadata (number, time, validity, sectors, telemetry flag) without loading full telemetry."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, session_id, source_file, duration FROM sessions WHERE id = ? OR session_id = ?",
                (session_id, session_id),
            )
            s_row = cursor.fetchone()
            if not s_row:
                return []
            sid = str(s_row["session_id"])
            is_demo = sid.startswith("synth_")
            src = str(s_row["source_file"] or "").lower()
            sess_has_tel = not (
                src.endswith(".xml")
                or src.endswith(".json")
                or (float(s_row["duration"] or 0.0) <= 0.0 and not is_demo)
            )
            cursor.execute(
                "SELECT lap_number, lap_time, sector_times, is_valid FROM laps WHERE session_id = ? ORDER BY lap_number ASC",
                (s_row["id"],),
            )
            rows = cursor.fetchall()
            best_t = min((float(r["lap_time"]) for r in rows if float(r["lap_time"]) > 20.0), default=0.0)
            return [
                {
                    "lap_number": r["lap_number"],
                    "lap_time": r["lap_time"],
                    "sector_times": json.loads(r["sector_times"]) if r["sector_times"] else [],
                    "is_valid": bool(r["is_valid"]),
                    "has_telemetry": sess_has_tel,
                    "is_outlap": bool(
                        r["lap_time"] > 150.0
                        or (
                            r["lap_number"] == 1
                            and (not r["is_valid"] or (best_t > 0.0 and float(r["lap_time"]) > best_t * 1.05))
                        )
                    ),
                }
                for r in rows
            ]

    def save_coach_report(self, session_id: str, ref_lap: int, comp_lap: int, report: CoachReport):
        """Persist generated coaching report."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
            INSERT INTO coach_reports (
                session_id, ref_lap, comp_lap, facts, metrics, hypotheses, exercises,
                verification_indicator, confidence, raw_report, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
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
                ),
            )
            conn.commit()

    def get_coach_report(self, session_id: str, ref_lap: int, comp_lap: int) -> CoachReport | None:
        """Fetch previously stored coaching report."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
            SELECT * FROM coach_reports
            WHERE (session_id = ? OR session_id IN (SELECT id FROM sessions WHERE session_id = ?))
              AND ref_lap = ? AND comp_lap = ?
            ORDER BY created_at DESC LIMIT 1
            """,
                (session_id, session_id, ref_lap, comp_lap),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return CoachReport(
                facts=json.loads(row["facts"]) if row["facts"] else [],
                metrics=json.loads(row["metrics"]) if row["metrics"] else {},
                hypotheses=json.loads(row["hypotheses"]) if row["hypotheses"] else [],
                exercises=json.loads(row["exercises"]) if row["exercises"] else [],
                verification_indicator=row["verification_indicator"] or "",
                confidence=row["confidence"] or "Alta",
                raw_report=row["raw_report"] or "",
                created_at=datetime.fromisoformat(row["created_at"]),
            )
