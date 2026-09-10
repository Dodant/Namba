"""SQLite access. No ORM -- stdlib sqlite3 is enough at this size."""
import os
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timezone

DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("NAMBA_DB", os.path.join(DIR, "namba.db"))
# Beside DB_PATH because it is the same question -- where this install keeps
# what has to outlive the process -- and because the two shell commands that
# read it, `admin.py purge` and `gc_uploads.py`, would otherwise import
# `main` for one string and build the whole FastAPI app to get it.
UPLOAD_DIR = os.environ.get("NAMBA_UPLOADS", os.path.join(DIR, "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
-- a thing must outlive the thing, and target_id points at five different
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
CREATE INDEX IF NOT EXISTS idx_events_target ON events(target_type, target_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_events_ip     ON events(ip_hash, id DESC);
-- Do not index events(id DESC) for the feed's newest-first order: `id` is
-- `INTEGER PRIMARY KEY`, an alias for the rowid, so the table already is that
-- index. The two above earn their keep by leading with the column filtered on.
DROP INDEX IF EXISTS idx_events_at;
-- The order and a window are different questions, and `at > ?` matches none of
-- the above. The dashboard asks it twice on every load.
CREATE INDEX IF NOT EXISTS idx_events_since  ON events(at);
-- The back office's revision list joins events on this to turn "someone" into
-- an action and a client hash. Without it that join scans the one table here
-- that only ever grows, once per entry whose history an operator opens -- and
-- the entry worth opening is the one that has been fought over, which is also
-- the one with the most revisions to join. Mostly NULL (only an action that
-- pushed a snapshot has a value), which is what makes the index small.
CREATE INDEX IF NOT EXISTS idx_events_revision ON events(revision_id);

-- Operators. This is the only account table there will ever be: readers have
-- none, there is no signup route, and nothing here is per-post ownership.
-- An operator exists so that a decision can carry a name and be undone, which
-- is a different thing from a login.
--
-- active rather than a DELETE: every audit row points at an id here, and an
-- operator who leaves must not take their record with them.
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,                   -- scrypt$n$r$p$salt$key, see auth.py
  role          TEXT NOT NULL DEFAULT 'ADMIN',   -- ADMIN | SUPER_ADMIN
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  last_login_at TEXT,
  -- NULL until `admin.py totp-enroll`. The actual TOTP key is derived from the
  -- installation secret and this generation, so a database leak does not carry
  -- the second factor with it. Incrementing the generation is a reset.
  totp_generation   INTEGER,
  totp_last_counter INTEGER
);

-- The cookie's value is never stored, only its sha256: a leaked database is
-- then a list of dead tokens rather than a set of live logins. A session token
-- is 256 bits from secrets, so a bare hash is enough -- the salting in
-- events.py is for low-entropy inputs like an address, not for this.
--
-- The foreign key does cascade, and here that is right: a session is not a
-- record of anything. What has to outlive the account is the audit row, and
-- that is in events, which has no keys at all.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_hash    TEXT NOT NULL
);

-- Password success is not a session. It buys five minutes in which to present
-- the second factor, through an opaque token whose hash is all the database
-- keeps. Attempts live here as well, so restarting the one worker does not give
-- a challenge five more guesses.
CREATE TABLE IF NOT EXISTS admin_login_challenges (
  token_hash TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_login_challenges_expires
  ON admin_login_challenges(expires_at);

-- What a visitor sends instead of a delete button. No foreign key: a request
-- has to be readable after the entry it asked about is gone, or the audit trail
-- ends exactly where somebody would want to read it.
--
-- One pending request per client per entry, enforced in the route rather than
-- by a UNIQUE -- a visitor with no cookie has a NULL client_hash, and NULL is
-- distinct from NULL in a unique index, so the constraint would not hold for
-- the half of visitors it matters most for.
CREATE TABLE IF NOT EXISTS delete_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  requested_by  TEXT,                              -- the nickname typed, if any
  ip_hash       TEXT, ua_hash TEXT, client_hash TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | APPROVED | REJECTED
  created_at    TEXT NOT NULL,
  decided_at    TEXT,
  decided_by    INTEGER,                           -- admins.id
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON delete_requests(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_delete_requests_post   ON delete_requests(post_id);

-- Nearly the same columns as delete_requests and deliberately not the same
-- table. A report is counted per entry -- five of them is one row on the
-- moderation page with a count of five -- while a request is decided one at a
-- time. The reason vocabularies differ, the decisions differ, and the dashboard
-- counts them apart.
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  ip_hash       TEXT, ua_hash TEXT, client_hash TEXT,
  status        TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN | RESOLVED | IGNORED
  created_at    TEXT NOT NULL,
  decided_at    TEXT,
  decided_by    INTEGER,
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_post   ON reports(post_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, id DESC);

-- Who may not write. Two kinds because neither is enough alone: a block on an
-- address catches a browser with its cookies cleared, and a block on a cookie
-- catches the same person on a new address. Neither is proof of who anybody is,
-- which is why expires_at exists and why a permanent one has to be typed.
--
-- Lifting sets lifted_at rather than deleting the row: "we blocked this and
-- then let it back in" is a thing an operator needs to be able to read, and a
-- DELETE says only "we never did".
CREATE TABLE IF NOT EXISTS blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,             -- ip | client
  target_hash TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  created_by  INTEGER NOT NULL,          -- admins.id
  expires_at  TEXT,                      -- NULL is permanent
  lifted_at   TEXT,
  lifted_by   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_blocks_target ON blocks(target_hash);
"""

# What the TEXT columns above may hold. Here rather than beside the routes
# because they are a property of the schema, and both main.py and admin_api.py
# need them without importing each other.
#
# Not SQL CHECK constraints, and that is a real trade rather than laziness:
# CREATE TABLE IF NOT EXISTS skips a database that already exists, and SQLite
# cannot ALTER a CHECK in afterwards -- so a constraint here would be enforced
# on fresh installs and absent on upgraded ones, which is worse than none.
# Pydantic on the way in is what holds it, and a 422 says so loudly.
POST_STATUSES = ("ACTIVE", "HIDDEN", "DELETED")
DELETE_REASONS = ("DUPLICATE", "INCORRECT", "NO_SOURCE", "SPAM", "VANDALISM", "OTHER")
REPORT_REASONS = ("INCORRECT", "SPAM", "AD", "ABUSE", "COPYRIGHT", "SOURCE",
                  "VANDALISM", "OTHER")
REQUEST_STATUSES = ("PENDING", "APPROVED", "REJECTED")
REPORT_STATUSES = ("OPEN", "RESOLVED", "IGNORED")
BLOCK_TYPES = ("ip", "client")
# What the panel offers. Hours, because the API takes hours and None is
# permanent -- these five are a choice about what an operator should be nudged
# towards, not a limit on what the column can hold.
BLOCK_HOURS = (1, 24, 24 * 7, 24 * 30, None)


def get_db():
    """A connection per request, closed on the way out. A FastAPI dependency.

    Here rather than in main.py so that the admin router can take it without
    importing the app -- main.py includes that router, so an import the other
    way round would be a cycle.
    """
    con = connect()
    try:
        yield con
    finally:
        con.close()


@contextmanager
def writing(con):
    """A transaction that holds the write lock from its first line, not its
    first write.

    `with con:` is not this, and the difference is the whole reason this exists.
    Python's sqlite3 in its legacy isolation mode issues `BEGIN DEFERRED` before
    the first INSERT, UPDATE or DELETE -- so a SELECT that runs earlier in the
    block, even one the block was opened for, runs with no lock held at all. In
    WAL that is not an error and never fails: it is a read of the database as it
    was, answered while another writer commits over it, and the route then
    decides on what it read. `BEGIN IMMEDIATE` takes the lock up front, so
    everything from here to the commit sees one database and no other writer
    gets in.

    Moving the read in without this is worse than leaving it out, which is why
    the two halves are one change. A deferred transaction that reads and then
    writes has to *upgrade* its lock, and two of them doing it together is a
    deadlock SQLite cannot wait out: the second gets SQLITE_BUSY at once and
    `busy_timeout` does not apply, so a pair that races quietly with the read
    outside a transaction answers "database is locked" with a 500 with it
    inside a deferred one. ADR-0007 has the measurement, on two concurrent
    creates of one abbreviation.

    Use it for a write that *decides* -- a 404 on a row that has to still be
    there, a duplicate check, a format that depends on what a sibling entry
    already chose. A write that only appends does not need it, and `with con:`
    is the right amount of ceremony for one INSERT.

    ponytail: this serializes writers for the length of the block, including
    the reads inside it. Readers are untouched -- that is what WAL bought -- and
    at twenty writes a minute per address the wait is theoretical; the 5s
    busy_timeout is what answers it if it ever is not. Do not put file or
    network I/O in here.
    """
    con.execute("BEGIN IMMEDIATE")
    try:
        yield con
    except BaseException:
        con.rollback()
        raise
    con.commit()


def now():
    """The one timestamp format in this database: UTC, ISO 8601, whole seconds.

    Here rather than in main.py because it is a property of the schema -- every
    `TEXT NOT NULL` date column above is written by this function, and events.py
    needs it without importing the app.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def nfc(value):
    """Text as this database stores it: Unicode normal form C.

    A property of the TEXT columns, like `now()` is of the date ones. Some
    apps on macOS hand over Korean as decomposed jamo, and every file name
    does; composed and decomposed are different strings to SQLite, so without
    one form "한국어" is two tags, two languages and a search that misses.
    Every string a write takes goes through this (`store.Text`), and so does
    every parameter a read filters on. A list is folded element by element;
    anything that is not text comes back as it was.
    """
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [nfc(v) for v in value]
    return value


# Every column a stranger's text lands in, for the one-time fold in init().
# Snapshots are left alone: `revisions.snapshot` is JSON and a restore writes
# it back through `store`, which folds on the way.
TEXT_COLUMNS = (
    ("posts", "id", ("value", "title", "body", "author", "edited_by", "lang")),
    ("translations", "id", ("lang", "title", "body", "author", "edited_by")),
    ("comments", "id", ("author", "body")),
    ("delete_requests", "id", ("detail", "requested_by")),
    ("reports", "id", ("detail",)),
)


# The one character LIKE patterns are escaped with. Backslash is the usual
# pick and would have to be doubled in every Python string and every SQL
# literal here; "!" is neither special to LIKE nor to either language, so both
# sides stay readable.
LIKE_ESC = "!"


def like(q):
    """A user's words as a LIKE pattern, with the wildcards taken out.

    Here beside the schema for the same reason `now()` is: it is a property of
    how this database is queried, and both `main.py` and `admin_api.py` need it
    without importing each other. Every `LIKE ?` fed from this has to carry
    `ESCAPE '!'`.

    Not a security fix -- the value is bound, never interpolated. It is a
    correctness one: `%` and `_` are wildcards, so searching for "100%" matched
    everything beginning 100, "snake_case" matched "snakeXcase", and a search
    for "_" alone matched the whole wiki, which on an unlimited read is also
    the cheapest way to make the server work hard.
    """
    for ch in (LIKE_ESC, "%", "_"):
        q = q.replace(ch, LIKE_ESC + ch)
    return f"%{q}%"


def connect():
    # check_same_thread=False because FastAPI opens the connection in one
    # threadpool thread and runs the endpoint in another. Safe here: every
    # request gets its own connection and closes it before returning, so no
    # two threads ever touch the same one.
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def _columns_added_since_the_first_release(con):
    """The columns SCHEMA declares that an older database does not have.

    `CREATE TABLE IF NOT EXISTS` skips a database that already exists, so a
    column added to the DDL above never reaches one. Each still asks before it
    adds: a database from before this list was numbered may already have any
    of them, put there by the version of this file that asked every time.
    """
    have = {r["name"] for r in con.execute("PRAGMA table_info(posts)")}
    if "edited_by" not in have:
        con.execute("ALTER TABLE posts ADD COLUMN edited_by TEXT")
    # NULL on every existing row, and it stays that way. Guessing that the
    # Korean-titled seed entries are Korean would be the importer correcting
    # its source, which is the wiki's job and not this file's.
    if "lang" not in have:
        con.execute("ALTER TABLE posts ADD COLUMN lang TEXT")
    # 0 on every existing row: nothing gets separators it did not ask for
    if "grouped" not in have:
        con.execute("ALTER TABLE posts ADD COLUMN grouped INTEGER NOT NULL DEFAULT 0")
    # ACTIVE on every existing row: a schema change hides nothing
    if "status" not in have:
        con.execute("ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'")
    admins = {r["name"] for r in con.execute("PRAGMA table_info(admins)")}
    if "totp_generation" not in admins:
        con.execute("ALTER TABLE admins ADD COLUMN totp_generation INTEGER")
    if "totp_last_counter" not in admins:
        con.execute("ALTER TABLE admins ADD COLUMN totp_last_counter INTEGER")


def _tags_are_lower_case(con):
    """lower() is the rule for a tag; rows written under an upper-case one
    move with it.

    The delete goes first because (post_id, tag) is the primary key -- a post
    holding both BOOK and book cannot have the first renamed onto the second.
    """
    con.execute(
        """DELETE FROM post_tags WHERE tag <> lower(tag) AND EXISTS (
             SELECT 1 FROM post_tags o
             WHERE o.post_id = post_tags.post_id AND o.tag = lower(post_tags.tag))"""
    )
    con.execute("UPDATE post_tags SET tag = lower(tag) WHERE tag <> lower(tag)")


def _text_is_one_normal_form(con):
    """Rows written before `nfc()` was the rule, folded.

    SQLite has no normalize(), so the rows are read and the ones that change
    are written back. Tags first and by hand, because (post_id, tag) is the
    primary key and a post holding the word both ways cannot have one renamed
    onto the other.
    """
    for post_id, tag in con.execute("SELECT post_id, tag FROM post_tags").fetchall():
        if nfc(tag) != tag:
            con.execute("DELETE FROM post_tags WHERE post_id = ? AND tag = ?",
                        (post_id, tag))
            con.execute("INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)",
                        (post_id, nfc(tag)))
    for table, key, cols in TEXT_COLUMNS:
        rows = con.execute(f"SELECT {key}, {', '.join(cols)} FROM {table}").fetchall()
        for row in rows:
            folded = [nfc(row[c]) for c in cols]
            if folded != [row[c] for c in cols]:
                con.execute(
                    f"UPDATE {table} SET {', '.join(c + ' = ?' for c in cols)} "
                    f"WHERE {key} = ?", (*folded, row[key]))


# In order, and append-only: a step's number is what a database records as
# having been done, so inserting one in the middle re-runs the wrong thing
# somewhere. Two of the three are data passes over every row of six tables,
# which is why they are numbered rather than asked: on every start they were a
# full scan per process, on a file that only ever grows.
#
# Each is still written to be idempotent, and that is not belt and braces.
# Every database that exists today is at version 0 with the columns already
# added and the passes already run, by the version of this file that asked
# every time -- so the first numbered run has to be a no-op on them rather
# than an error.
#
# This is not a migration tool and must not become one (ADR-0022). It is a
# list, an integer in the file header, and the loop in init() below.
MIGRATIONS = (
    _columns_added_since_the_first_release,
    _tags_are_lower_case,
    _text_is_one_normal_form,
)


def init():
    con = connect()
    # WAL rather than the default rollback journal, which lets a writer lock
    # every reader out: /p/42 carries its own <head>, so an entry's page load
    # reads this file before it can answer at all, and one person saving an
    # entry must not stall everyone reading one. Set here rather than in
    # connect() because the mode lives in the file header -- it survives the
    # process, so every later connection inherits it. A writer still waits for
    # a writer; the 5s default busy_timeout covers that.
    con.execute("PRAGMA journal_mode = WAL")
    # Asked before SCHEMA runs, because after it there is no telling a new file
    # from an old one. A new file gets every column the DDL declares and has no
    # rows, so every step above is already true of it and it is stamped at the
    # end of the list rather than walked through it.
    fresh = not con.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'posts'"
    ).fetchone()
    with con:
        con.executescript(SCHEMA)
        done = len(MIGRATIONS) if fresh else con.execute(
            "PRAGMA user_version").fetchone()[0]
        for number, step in enumerate(MIGRATIONS[done:], start=done + 1):
            step(con)
            # not a bound parameter: PRAGMA does not take one. It is an int
            # from enumerate, so there is nothing here to inject.
            con.execute(f"PRAGMA user_version = {number}")
        if fresh:
            con.execute(f"PRAGMA user_version = {len(MIGRATIONS)}")
    con.close()
