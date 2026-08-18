"""SQLite access. No ORM -- stdlib sqlite3 is enough at this size."""
import os
import sqlite3

DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("NAMBA_DB", os.path.join(DIR, "namba.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  value      TEXT NOT NULL,
  format     TEXT NOT NULL,
  sort_key   REAL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  image      TEXT,
  author     TEXT NOT NULL DEFAULT 'anonymous',  -- whoever wrote it first; never overwritten
  edited_by  TEXT,                                 -- whoever touched it last, if anyone
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_value  ON posts(value);
CREATE INDEX IF NOT EXISTS idx_posts_format ON posts(format, sort_key);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL,
  PRIMARY KEY (post_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);

-- symmetric link stored once, always with a_id < b_id
CREATE TABLE IF NOT EXISTS post_links (
  a_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (a_id, b_id),
  CHECK (a_id < b_id)
);
CREATE INDEX IF NOT EXISTS idx_post_links_b ON post_links(b_id);

-- Snapshot of a post taken immediately before every edit, restore and delete.
-- Deliberately NOT a foreign key: on an open no-login wiki these rows are the
-- only thing standing between vandalism and permanent data loss, so they must
-- outlive the post they describe.
CREATE TABLE IF NOT EXISTS revisions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id  INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  author   TEXT NOT NULL,
  at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_post ON revisions(post_id, id DESC);

-- The same entry written in another language. lang is a free-form label, so
-- NOCASE keeps "Korean" and "korean" from becoming two tabs; it only folds
-- ASCII, which is the useful half. One row per language per post, so writing
-- the same language twice is an edit rather than a duplicate.
CREATE TABLE IF NOT EXISTS translations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL COLLATE NOCASE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  author     TEXT NOT NULL DEFAULT 'anonymous',  -- first writer, never overwritten
  edited_by  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (post_id, lang)
);
"""


def connect():
    # check_same_thread=False because FastAPI opens the connection in one
    # threadpool thread and runs the endpoint in another. Safe here: every
    # request gets its own connection and closes it before returning, so no
    # two threads ever touch the same one.
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init():
    con = connect()
    with con:
        con.executescript(SCHEMA)
        # CREATE TABLE IF NOT EXISTS skips existing databases, so new columns
        # need their own pass. Cheap and idempotent; no migration tool wanted.
        have = {r["name"] for r in con.execute("PRAGMA table_info(posts)")}
        if "edited_by" not in have:
            con.execute("ALTER TABLE posts ADD COLUMN edited_by TEXT")
    con.close()
