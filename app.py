# app.py — Fixed webhook endpoint
import os
import re
import json
import hmac
import hashlib
import sqlite3
from flask import Flask, request

app = Flask(__name__)

DB_PATH = os.getenv("DB_PATH", "/tmp/app.db")

# Raise at startup if secret is missing — no silent dev-secret fallback
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")
if not WEBHOOK_SECRET:
    raise RuntimeError("WEBHOOK_SECRET environment variable is required")

# Limit request body to 64 KB to prevent memory exhaustion
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

ALLOWED_ROLES = {"user", "admin", "vendor"}


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    """Create tables if they don't exist yet."""
    db = get_db()
    try:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                role  TEXT NOT NULL DEFAULT 'user'
            );
            CREATE TABLE IF NOT EXISTS webhook_audit (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                email      TEXT,
                raw_json   TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            """
        )
        db.commit()
    finally:
        db.close()


def verify(sig: str, body: bytes) -> bool:
    """
    Verify HMAC-SHA256 signature.
    Uses hmac.compare_digest to prevent timing attacks.
    """
    expected = hashlib.sha256(
        (WEBHOOK_SECRET + body.decode("utf-8")).encode("utf-8")
    ).hexdigest()
    return hmac.compare_digest(expected, sig)  # constant-time compare


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


@app.post("/webhook")
def webhook():
    raw: bytes = request.data

    # --- Signature verification ---
    sig = request.headers.get("X-Signature", "")
    if not sig or not verify(sig, raw):
        return ("bad sig", 401)

    # --- JSON parsing ---
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return ("invalid json", 400)

    if not isinstance(payload, dict):
        return ("invalid payload", 400)

    email: str = payload.get("email", "")
    role: str = payload.get("role", "user")
    metadata: dict = payload.get("metadata", {})

    # --- Input validation ---
    if not is_valid_email(email):
        return ("invalid email", 400)

    if role not in ALLOWED_ROLES:
        return ("invalid role", 400)

    db = get_db()
    try:
        # Store raw payload for auditing / debugging — parameterized query
        db.execute(
            "INSERT INTO webhook_audit(email, raw_json) VALUES (?, ?)",
            (email, raw.decode("utf-8")),
        )

        # True upsert: insert or update on conflict
        db.execute(
            """
            INSERT INTO users(email, role) VALUES (?, ?)
            ON CONFLICT(email) DO UPDATE SET role = excluded.role
            """,
            (email, role),
        )

        db.commit()
    finally:
        db.close()

    return ("ok", 200)


if __name__ == "__main__":
    init_db()
    # Use a production WSGI server (gunicorn) instead of Flask's dev server.
    # This dev runner is only for local testing.
    app.run(host="127.0.0.1", port=8080, debug=False)
