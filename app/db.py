"""SQLite storage. One file, no migrations framework — just CREATE IF NOT EXISTS."""
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(os.environ.get("HANZI_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DB_PATH = DATA_DIR / "hanzi.db"
SEED_PATH = Path(__file__).resolve().parent / "data" / "hsk1.json"

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY,
    hanzi TEXT NOT NULL UNIQUE,
    pinyin TEXT NOT NULL,
    english TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Custom',
    position INTEGER NOT NULL DEFAULT 100000,
    source TEXT NOT NULL DEFAULT 'hsk1',
    extras TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- One card per (word, skill). Created when the word is learned.
-- skill: write (handwriting), speak (pronunciation), recall (meaning/pinyin)
CREATE TABLE IF NOT EXISTS cards (
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    ease REAL NOT NULL DEFAULT 2.5,
    interval REAL NOT NULL DEFAULT 0,
    due TEXT NOT NULL,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    last_review TEXT,
    PRIMARY KEY (word_id, skill)
);

CREATE TABLE IF NOT EXISTS activity (
    day TEXT PRIMARY KEY,
    xp INTEGER NOT NULL DEFAULT 0,
    new_words INTEGER NOT NULL DEFAULT 0,
    reviews INTEGER NOT NULL DEFAULT 0,
    sentences INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sentence_log (
    id INTEGER PRIMARY KEY,
    english TEXT NOT NULL,
    hanzi TEXT NOT NULL,
    mode TEXT NOT NULL,
    score INTEGER,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


_conn: sqlite3.Connection | None = None


@contextmanager
def db():
    """Single shared connection guarded by a lock — plenty for one user."""
    global _conn
    with _lock:
        if _conn is None:
            _conn = connect()
        try:
            yield _conn
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise


def init():
    with db() as c:
        c.executescript(SCHEMA)
        if c.execute("SELECT COUNT(*) FROM words").fetchone()[0] == 0:
            seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            pos = 0
            for unit in seed["units"]:
                for hanzi, pinyin, english in unit["words"]:
                    c.execute(
                        "INSERT OR IGNORE INTO words (hanzi, pinyin, english, unit, position, source)"
                        " VALUES (?, ?, ?, ?, ?, 'hsk1')",
                        (hanzi, pinyin, english, unit["name"], pos),
                    )
                    pos += 1


def rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]
