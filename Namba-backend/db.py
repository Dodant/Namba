"""SQLite access. No ORM -- stdlib sqlite3 is enough at this size."""
import os
import sqlite3
from datetime import datetime, timezone

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
  lang       TEXT,                                 -- what title/body are written in; free-form, like translations.lang
  grouped    INTEGER NOT NULL DEFAULT 0,           -- show the value with thousands separators; display only, never in `value`
  likes      INTEGER NOT NULL DEFAULT 0,
  -- ACTIVE | HIDDEN | DELETED. Nothing the API can do removes a row: a hidden
  -- entry drops out of every public read and `show` brings it back whole,
  -- which is what makes moderation reversible on a wiki nobody logs into.
  -- HIDDEN and DELETED read the same to a visitor and are kept apart for the
  -- operator: one is "taken down", the other "removed on request".
  -- No index. Three values, and almost every row is ACTIVE, so it could never
  -- be selective; a few thousand rows scan in microseconds.
  status     TEXT NOT NULL DEFAULT 'ACTIVE',
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

-- Snapshot of a post taken immediately before every edit and every restore.
-- Deliberately NOT a foreign key: on an open no-login wiki these rows are the
-- only thing standing between vandalism and permanent data loss, so they must
-- outlive the post they describe -- and rows left by the DELETE route that used
-- to exist are the only copy of the entries it took away. Hiding an entry takes
-- no snapshot: nothing about it changed except whether the wiki shows it.
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

-- Talk beside an entry rather than about the entry. The opposite call to
-- revisions above, for the opposite reason: a snapshot is what stands between
-- vandalism and permanent loss, so it has to outlive the post it describes,
-- while a comment is a remark on one and has nothing to recover. So this table
-- does have the foreign key, it does cascade, and it is never snapshotted.
-- Hiding an entry hides the talk with it and shows it again unchanged -- the
-- row stays, so nothing cascades. The cascade is for `admin.py purge`, the one
-- hard delete there is, where taking the talk along is the point.
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author     TEXT NOT NULL DEFAULT 'anonymous',
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id DESC);

-- One row for everything that happened. admin_id NULL is a visitor and a set
-- one is an operator's own decision, which is what makes this the activity
-- feed, the audit log and the spam evidence all at once: the shape is the same
-- and only the filter differs.
--
-- Append-only. Nothing in this codebase issues an UPDATE or a DELETE here, and
-- that is the point -- an audit log an operator can tidy is not one. No foreign
-- keys either, for the reason revisions has none: a record of what happened to
-- a thing must outlive the thing, and target_id points at four different
-- tables anyway.
--
-- No raw address is stored. The three hashes are salted with the install's own
-- key (see events.py); ip_hash is what the write limiter counts and what a
-- block is written against.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  action      TEXT NOT NULL,   -- CREATE EDIT RESTORE TRANSLATE UNTRANSLATE
                               -- COMMENT LINK UNLINK UPLOAD, and the operator's
                               -- own ADMIN_* and CONTENT_* actions
  admin_id    INTEGER,
  actor       TEXT,            -- the nickname typed, when there was one
  target_type TEXT,            -- post | request | report | block | admin
  target_id   INTEGER,
  revision_id INTEGER,         -- the snapshot this action pushed into history
  ip_hash     TEXT,
  ua_hash     TEXT,
  client_hash TEXT,
  meta        TEXT             -- JSON; whatever the action needs to be readable
);
CREATE INDEX IF NOT EXISTS idx_events_at     ON events(id DESC);
CREATE INDEX IF NOT EXISTS idx_events_target ON events(target_type, target_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_events_ip     ON events(ip_hash, id DESC);
"""


def now():
    """The one timestamp format in this database: UTC, ISO 8601, whole seconds.

    Here rather than in main.py because it is a property of the schema -- every
    `TEXT NOT NULL` date column above is written by this function, and events.py
    needs it without importing the app.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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
    # WAL rather than the default rollback journal, which lets a writer lock
    # every reader out: /p/42 carries its own <head>, so *every* page load reads
    # this file, and one person saving an entry must not stall everyone reading
    # one. Set here rather than in connect() because the mode lives in the file
    # header -- it survives the process, so every later connection inherits it.
    # A writer still waits for a writer; the 5s default busy_timeout covers that.
    con.execute("PRAGMA journal_mode = WAL")
    with con:
        con.executescript(SCHEMA)
        # CREATE TABLE IF NOT EXISTS skips existing databases, so new columns
        # need their own pass. Cheap and idempotent; no migration tool wanted.
        have = {r["name"] for r in con.execute("PRAGMA table_info(posts)")}
        if "edited_by" not in have:
            con.execute("ALTER TABLE posts ADD COLUMN edited_by TEXT")
        # NULL on every existing row, and it stays that way. Guessing that the
        # Korean-titled seed entries are Korean would be the importer correcting
        # its source, which is the wiki's job and not this file's.
        if "lang" not in have:
            con.execute("ALTER TABLE posts ADD COLUMN lang TEXT")
        # Tags were upper-cased until they became free-form; lower() is the
        # rule now, so rows written under the old one move with it. Idempotent:
        # after the first pass nothing matches. The delete goes first because
        # (post_id, tag) is the primary key -- a post holding both BOOK and
        # book cannot have the first renamed onto the second.
        con.execute(
            """DELETE FROM post_tags WHERE tag <> lower(tag) AND EXISTS (
                 SELECT 1 FROM post_tags o
                 WHERE o.post_id = post_tags.post_id AND o.tag = lower(post_tags.tag))"""
        )
        con.execute("UPDATE post_tags SET tag = lower(tag) WHERE tag <> lower(tag)")

        # 0 on every existing row: nothing gets separators it did not ask for
        if "grouped" not in have:
            con.execute(
                "ALTER TABLE posts ADD COLUMN grouped INTEGER NOT NULL DEFAULT 0"
            )

        # ACTIVE on every existing row: a schema change hides nothing
        if "status" not in have:
            con.execute(
                "ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'"
            )
    con.close()
