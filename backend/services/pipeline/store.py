"""
SQLite persistence for jobs and cached results.

One short-lived connection per call keeps this safe across the API threads
and the worker thread without a shared lock. Results are keyed by
(sha256 of the uploaded bytes, PIPELINE_VERSION): the same file is never
analysed twice by the same pipeline code.
"""

import json
import os
import sqlite3
import time
from contextlib import contextmanager
from typing import Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    file_hash     TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    status        TEXT NOT NULL,          -- queued | running | completed | failed
    stage         TEXT NOT NULL,
    progress      REAL NOT NULL DEFAULT 0,
    cached        INTEGER NOT NULL DEFAULT 0,
    error_code    TEXT,
    error_message TEXT,
    created_at    REAL NOT NULL,
    updated_at    REAL NOT NULL,
    finished_at   REAL
);
CREATE INDEX IF NOT EXISTS jobs_by_hash ON jobs(file_hash, status);

CREATE TABLE IF NOT EXISTS results (
    file_hash        TEXT NOT NULL,
    pipeline_version INTEGER NOT NULL,
    result_json      TEXT NOT NULL,
    created_at       REAL NOT NULL,
    PRIMARY KEY (file_hash, pipeline_version)
);
"""

ACTIVE = ("queued", "running")


class Store:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        with self._conn() as c:
            c.execute("PRAGMA journal_mode=WAL")
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # ── jobs ────────────────────────────────────────────────────────────
    def create_job(self, job_id: str, file_hash: str, file_name: str, *, status: str = "queued",
                   stage: str = "queued", progress: float = 0.0, cached: bool = False) -> None:
        now = time.time()
        with self._conn() as c:
            c.execute(
                "INSERT INTO jobs (id, file_hash, file_name, status, stage, progress, cached, created_at, updated_at, finished_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (job_id, file_hash, file_name, status, stage, progress, int(cached), now, now,
                 now if status == "completed" else None),
            )

    def update_job(self, job_id: str, **fields) -> None:
        fields["updated_at"] = time.time()
        if fields.get("status") in ("completed", "failed"):
            fields["finished_at"] = fields["updated_at"]
        cols = ", ".join(f"{k} = ?" for k in fields)
        with self._conn() as c:
            c.execute(f"UPDATE jobs SET {cols} WHERE id = ?", (*fields.values(), job_id))

    def get_job(self, job_id: str) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def active_job_for_hash(self, file_hash: str) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM jobs WHERE file_hash = ? AND status IN (?, ?) ORDER BY created_at LIMIT 1",
                (file_hash, *ACTIVE),
            ).fetchone()
        return dict(row) if row else None

    def fail_interrupted_jobs(self, code: str, message: str) -> int:
        """Jobs left queued/running by a previous server process can never finish."""
        now = time.time()
        with self._conn() as c:
            cur = c.execute(
                "UPDATE jobs SET status = 'failed', error_code = ?, error_message = ?, updated_at = ?, finished_at = ?"
                " WHERE status IN (?, ?)",
                (code, message, now, now, *ACTIVE),
            )
            return cur.rowcount

    # ── results cache ──────────────────────────────────────────────────
    def save_result(self, file_hash: str, version: int, result: dict) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO results (file_hash, pipeline_version, result_json, created_at) VALUES (?, ?, ?, ?)",
                (file_hash, version, json.dumps(result), time.time()),
            )

    def get_result(self, file_hash: str, version: int) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute(
                "SELECT result_json FROM results WHERE file_hash = ? AND pipeline_version = ?",
                (file_hash, version),
            ).fetchone()
        return json.loads(row["result_json"]) if row else None
