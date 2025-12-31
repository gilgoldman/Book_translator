"""
Database operations for Book Translator.
Uses in-memory SQLite stored in Streamlit session state.
"""

import sqlite3
import json
from datetime import datetime
from typing import Optional

import streamlit as st


def get_connection() -> sqlite3.Connection:
    """Get or create in-memory database connection stored in session state."""
    if "db_conn" not in st.session_state:
        conn = sqlite3.connect(":memory:", check_same_thread=False)
        conn.row_factory = sqlite3.Row
        _init_schema(conn)
        st.session_state.db_conn = conn
    return st.session_state.db_conn


def _init_schema(conn: sqlite3.Connection) -> None:
    """Initialize database schema."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            -- Input
            original_filename TEXT NOT NULL,

            -- Deduplication (first 100 chars of extracted text)
            text_fingerprint TEXT,

            -- Extracted & translated content
            extracted_text TEXT,
            translated_text_json TEXT,

            -- Status: pending, processing, completed, failed, duplicate
            status TEXT DEFAULT 'pending',
            duplicate_of_id INTEGER REFERENCES pages(id),

            -- Error handling
            retry_count INTEGER DEFAULT 0,
            last_error TEXT,

            -- Verification
            verification_passed BOOLEAN,
            verification_issues TEXT,

            -- Timestamps
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_fingerprint ON pages(text_fingerprint);
        CREATE INDEX IF NOT EXISTS idx_status ON pages(status);

        CREATE TABLE IF NOT EXISTS batch_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            total_pages INTEGER,
            completed_pages INTEGER DEFAULT 0,
            verify_enabled BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        );
    """)
    conn.commit()


def get_fingerprint(text: str) -> str:
    """Generate fingerprint from first 100 characters of text."""
    if not text or not text.strip():
        return "EMPTY_PAGE"
    return text.strip()[:100]


def check_duplicate(fingerprint: str) -> Optional[int]:
    """
    Check if a page with this fingerprint already exists.
    Returns the page ID if duplicate exists, None otherwise.
    """
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM pages WHERE text_fingerprint = ? AND status = 'completed'",
        (fingerprint,)
    ).fetchone()
    return row["id"] if row else None


def register_page(
    filename: str,
    fingerprint: str,
    extracted_text: str,
    translations: list
) -> int:
    """Register a new page in the database. Returns page ID."""
    conn = get_connection()
    cursor = conn.execute(
        """INSERT INTO pages (original_filename, text_fingerprint, extracted_text,
           translated_text_json, status)
           VALUES (?, ?, ?, ?, 'processing')""",
        (filename, fingerprint, extracted_text, json.dumps(translations))
    )
    conn.commit()
    return cursor.lastrowid


def record_duplicate(filename: str, fingerprint: str, duplicate_of_id: int) -> int:
    """Record a page as duplicate of another. Returns page ID."""
    conn = get_connection()
    cursor = conn.execute(
        """INSERT INTO pages (original_filename, text_fingerprint, status, duplicate_of_id)
           VALUES (?, ?, 'duplicate', ?)""",
        (filename, fingerprint, duplicate_of_id)
    )
    conn.commit()
    return cursor.lastrowid


def mark_completed(page_id: int, status: str = "completed") -> None:
    """Mark a page as completed or needs_review."""
    conn = get_connection()
    conn.execute(
        "UPDATE pages SET status = ?, completed_at = ? WHERE id = ?",
        (status, datetime.now().isoformat(), page_id)
    )
    conn.commit()


def mark_failed(page_id: int, error: str) -> None:
    """Mark a page as failed with error message."""
    conn = get_connection()
    conn.execute(
        """UPDATE pages SET status = 'failed', last_error = ?,
           retry_count = retry_count + 1 WHERE id = ?""",
        (error, page_id)
    )
    conn.commit()


def log_error(filename: str, error: str) -> None:
    """Log an error for a page that failed before registration."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO pages (original_filename, status, last_error)
           VALUES (?, 'failed', ?)""",
        (filename, error)
    )
    conn.commit()


def update_verification_status(page_id: int, passed: bool, issues: list) -> None:
    """Update verification status for a page."""
    conn = get_connection()
    conn.execute(
        "UPDATE pages SET verification_passed = ?, verification_issues = ? WHERE id = ?",
        (passed, json.dumps(issues) if issues else None, page_id)
    )
    conn.commit()


def get_verification_issues() -> list[dict]:
    """Get all pages that failed verification."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT original_filename, verification_issues
           FROM pages
           WHERE verification_passed = 0"""
    ).fetchall()

    return [
        {"filename": row["original_filename"], "issues": json.loads(row["verification_issues"] or "[]")}
        for row in rows
    ]


def get_failed_pages() -> list[dict]:
    """Get all pages that failed processing."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT original_filename, last_error FROM pages WHERE status = 'failed'"
    ).fetchall()

    return [
        {"filename": row["original_filename"], "error": row["last_error"]}
        for row in rows
    ]


def get_stats() -> dict:
    """Get processing statistics."""
    conn = get_connection()

    stats = {}
    for status in ["pending", "processing", "completed", "failed", "duplicate"]:
        count = conn.execute(
            "SELECT COUNT(*) FROM pages WHERE status = ?", (status,)
        ).fetchone()[0]
        stats[status] = count

    return stats


# Batch job functions
def save_batch_job(job_id: str, total_pages: int, verify: bool = False) -> int:
    """Save a batch job record. Returns job record ID."""
    conn = get_connection()
    cursor = conn.execute(
        """INSERT INTO batch_jobs (job_id, total_pages, verify_enabled, status)
           VALUES (?, ?, ?, 'pending')""",
        (job_id, total_pages, verify)
    )
    conn.commit()
    return cursor.lastrowid


def get_batch_job(job_id: str) -> Optional[dict]:
    """Get batch job by job ID."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM batch_jobs WHERE job_id = ?", (job_id,)
    ).fetchone()
    return dict(row) if row else None


def update_batch_job_status(job_id: str, status: str, completed_pages: int = None) -> None:
    """Update batch job status."""
    conn = get_connection()
    if completed_pages is not None:
        conn.execute(
            "UPDATE batch_jobs SET status = ?, completed_pages = ? WHERE job_id = ?",
            (status, completed_pages, job_id)
        )
    else:
        conn.execute(
            "UPDATE batch_jobs SET status = ? WHERE job_id = ?",
            (status, job_id)
        )
    conn.commit()


def reset_database() -> None:
    """Reset the database (clear all data)."""
    if "db_conn" in st.session_state:
        del st.session_state.db_conn
    get_connection()  # Reinitialize
