"""Namba API -- an open, no-login wiki of numbers."""
import html
import json
import os
import re
import time
from collections import defaultdict
from typing import ClassVar, List, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

import admin_api
import db
import events
from db import get_db, now
from store import (
    LIVE, fetch_one, guard_public, shape, snapshot, write_tags, write_translations,
)
from numfmt import FORMATS, bucket_of, grouped_value, parse_number

# A tag is whatever people call it, like a translation's language label. What
# is checked is its shape, not its membership of a list -- the wiki's working
# vocabulary is the set of tags actually in use, which /api/tags reports.
TAG_MAX = 24
# Two. A film of a book gets both, and that is already the widest an entry
# honestly is -- five was room to file one number under half the wiki.
TAGS_PER_POST = 2

UPLOAD_DIR = os.environ.get("NAMBA_UPLOADS", os.path.join(db.DIR, "uploads"))
# The built front end, served from here in production so that /p/42 can carry
# its own <head>. Absent in development -- npm run dev serves it and proxies
# the API, so the routes below simply never match there.
DIST = os.environ.get("NAMBA_DIST", os.path.join(db.DIR, os.pardir, "Namba-frontend", "dist"))
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_UPLOAD = 5 * 1024 * 1024
# What the uploads directory as a whole may reach. The per-file cap and the write
# limiter still leave one IP 100 MB a minute, and this disk holds the database
# too -- filling it takes the wiki down, not just the pictures. Raise it on a box
# with room; gc_uploads.py is what keeps it from being reached by accident.
UPLOAD_TOTAL_MAX = int(os.environ.get("NAMBA_UPLOAD_TOTAL_MB", 1024)) * 1024 * 1024
BLURB = 140  # body chars carried into the index list
# Revisions shipped by /api/posts/{id}/revisions, newest first. Every edit adds
# one and nothing prunes them, so an entry that has been fought over carries
# hundreds -- and the edit form asks for the list every time it opens.
REVISIONS_SHOWN = 50
# A comment is a remark, not an entry -- the title beside it takes 200
# characters and the body 5000. Hand-copied as a maxLength in the front end,
# where drift shows up as a 422 rather than as a quietly different rule.
COMMENT_MAX = 300
# Comments shipped by /api/posts/{id}/comments, newest first. The same bargain
# REVISIONS_SHOWN makes: the rows all stay, the response is capped.
COMMENTS_SHOWN = 200

os.makedirs(UPLOAD_DIR, exist_ok=True)
db.init()

app = FastAPI(title="Namba")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.middleware("http")
async def _nosniff(request, call_next):
    """Every response says its content type is the content type.

    For /uploads above, which is the only place on this wiki where a stranger's
    bytes are served back from our own origin. The upload route checks the
    extension and renames the file to a uuid, and it never looks inside -- so a
    .png holding markup is uploadable, and the only thing standing between that
    and the browser is the type StaticFiles guesses from the name. This is the
    header that makes the guess binding.

    Applied to the whole app rather than to that one mount: it is right for the
    JSON and for the two documents as well, and a subclass of StaticFiles to
    reach one response is more machinery than the rule deserves.
    """
    res = await call_next(request)
    res.headers["X-Content-Type-Options"] = "nosniff"
    return res
# Before every route below, and a long way before the catch-all: Starlette
# matches in the order routes are added, so /api/admin/... has to be registered
# ahead of @app.get("/{path:path}"). Included here rather than at the foot of
# the file so that the ordering rule is stated once, where the app is built.
app.include_router(admin_api.router)


def uploads_bytes():
    """What the uploads directory currently holds.

    ponytail: stats every file, on every upload. At 20 writes a minute and a few
    thousand pictures that is noise; keep a running total in a table if it ever
    is not.
    """
    return sum(f.stat().st_size for f in os.scandir(UPLOAD_DIR) if f.is_file())


# --- the write guard ----------------------------------------------------
# ponytail: in-memory, resets on restart and is per-process. Move to redis if
# this ever runs behind more than one worker.
_writes = defaultdict(list)
WRITE_LIMIT, WINDOW = 20, 60


def blocked(con, who):
    """The live block against this client, or None.

    Both hashes in one query, and reads never reach here -- blocking somebody
    from reading an open wiki achieves nothing, since the wiki is open. The
    operator's own routes do not depend on `guard` either, so an operator who
    blocks their own address can still work.
    """
    return con.execute(
        """SELECT type, reason, expires_at FROM blocks
           WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
             AND target_hash IN (?, ?) LIMIT 1""",
        (now(), who["ip_hash"], who["client_hash"] or ""),
    ).fetchone()


def guard(request: Request, con=Depends(get_db)):
    """Every write in the file depends on this: who is asking, and may they.

    It hands the caller's three hashes back, so a route that wants to record
    what happened has them without asking twice -- which is why the writes below
    take it as `who=` rather than throwing it away in `_=`.

    Counting is keyed on the *hash* now rather than the address. Same behaviour,
    and the raw IP stops sitting in a process dict for the lifetime of the
    worker. Reads go through nothing: there is nothing to record about a page
    view, and reading this wiki is meant to cost nothing at all.
    """
    who = events.client_of(request)
    # The harder no goes first. One query per write, which at twenty a minute is
    # noise; a cached set with a TTL is the next step and is not needed yet.
    hit = blocked(con, who)
    if hit:
        until = f" until {hit['expires_at']}" if hit["expires_at"] else ""
        raise HTTPException(
            403, f"This browser cannot write to the wiki{until}."
                 + (f" Reason given: {hit['reason']}." if hit["reason"] else "")
                 + " Reading is unaffected.")
    cutoff = time.monotonic() - WINDOW
    hits = [t for t in _writes[who["ip_hash"]] if t > cutoff]
    if len(hits) >= WRITE_LIMIT:
        raise HTTPException(429, "Too many writes. Slow down for a minute.")
    hits.append(time.monotonic())
    _writes[who["ip_hash"]] = hits
    return who


# --- models -------------------------------------------------------------
def _clean_tags(v):
    """Normalise, then check the shape. Lower-cased so Book and book cannot
    become two tags for one idea, whitespace collapsed so "sci  fi" and
    "sci fi" cannot either. Non-ASCII passes through unchanged, which is what
    lower() does with 한국어 and is the right answer for it.

    Lower rather than upper changes nothing on screen -- tagLabel() rebuilds
    "Book" from either -- but it is the case people type, so the form can fold
    input as it is typed without ever appearing to fight the typist.

    No slash: a tag is a path segment in /t/:tag, and the one in "HIP/HOP"
    would read as two. That is the same trap number values fall into, and they
    only get away with it because the API takes them as a query param.
    """
    out = []
    for t in v:
        t = " ".join(str(t).split()).lower()
        if not t:
            raise ValueError("a tag cannot be blank")
        if len(t) > TAG_MAX:
            raise ValueError(f"a tag is at most {TAG_MAX} characters: {t!r}")
        if "/" in t:
            raise ValueError(f"a tag cannot contain a slash: {t!r}")
        if t not in out:
            out.append(t)
    if len(out) > TAGS_PER_POST:
        raise ValueError(f"at most {TAGS_PER_POST} tags")
    return out


class PostIn(BaseModel):
    value: str = Field(min_length=1, max_length=32)
    format: Optional[str] = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=5000)
    image: Optional[str] = Field(default=None, max_length=300)
    author: str = Field(default="anonymous", max_length=40)
    tags: List[str] = Field(default_factory=list)
    lang: Optional[str] = Field(default=None, max_length=40)
    grouped: bool = False

    # min_length counts characters and "   " has three of them, while the
    # writes below store `value.strip()` and `title.strip()`. Without this a
    # form submitted with spaces in both was a 201 holding an empty title under
    # an empty number -- a blank row on the index whose link is /n/, which
    # matches no route, on a wiki where nothing removes an entry. Checked here
    # rather than by stripping on the way in: a poster who typed only spaces
    # meant to type something, and a 422 says so.
    @field_validator("value", "title")
    @classmethod
    def not_blank(cls, v):
        if v is not None and not v.strip():
            raise ValueError("must not be blank")
        return v

    @field_validator("lang")
    @classmethod
    def blank_lang(cls, v):
        return (v.strip() or None) if v is not None else None

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v):
        return _clean_tags(v)

    @field_validator("format")
    @classmethod
    def known_format(cls, v):
        if v is not None and v not in FORMATS:
            raise ValueError(f"format must be one of {FORMATS}")
        return v


class PostPatch(BaseModel):
    value: Optional[str] = Field(default=None, min_length=1, max_length=32)
    format: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    body: Optional[str] = Field(default=None, max_length=5000)
    image: Optional[str] = Field(default=None, max_length=300)
    author: str = Field(default="anonymous", max_length=40)
    tags: Optional[List[str]] = None
    lang: Optional[str] = Field(default=None, max_length=40)
    grouped: Optional[bool] = None

    # the same rule as PostIn: absent is fine, three spaces is not
    @field_validator("value", "title")
    @classmethod
    def not_blank(cls, v):
        if v is not None and not v.strip():
            raise ValueError("must not be blank")
        return v

    @field_validator("lang")
    @classmethod
    def blank_lang(cls, v):
        return (v.strip() or None) if v is not None else None

    @field_validator("tags")
    @classmethod
    def check_tags(cls, v):
        return v if v is None else _clean_tags(v)

    @field_validator("format")
    @classmethod
    def known_format(cls, v):
        if v is not None and v not in FORMATS:
            raise ValueError(f"format must be one of {FORMATS}")
        return v


class TranslationIn(BaseModel):
    lang: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=5000)
    author: str = Field(default="anonymous", max_length=40)

    @field_validator("lang", "title")
    @classmethod
    def not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class CommentIn(BaseModel):
    """Something said beside an entry.

    No edit and no delete in this first version. With no accounts a Remove
    button belongs to nobody, so it would be one stranger's button over
    everyone's words -- and unlike an entry a comment has no revision to fall
    back to, which makes the button the loss rather than the guard against it.
    The length cap and the write limiter are the whole moderation story.
    """

    body: str = Field(min_length=1, max_length=COMMENT_MAX)
    author: str = Field(default="anonymous", max_length=40)

    @field_validator("body")
    @classmethod
    def not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class FlagIn(BaseModel):
    """What a visitor sends instead of pressing a button that removes things.

    The shape of a delete request and of a report are the same shape; only the
    vocabulary of reasons differs, so the two below are three lines each. A
    detail box of 1000 rather than the comment cap of 300: a report is an
    argument addressed to whoever runs the wiki, not a remark beside the entry,
    and the one thing it must be able to do is explain itself.
    """

    REASONS: ClassVar[tuple] = ()
    reason: str = Field(max_length=40)
    detail: str = Field(default="", max_length=1000)

    @field_validator("reason")
    @classmethod
    def known_reason(cls, v):
        if v not in cls.REASONS:
            raise ValueError(f"reason must be one of {cls.REASONS}")
        return v


class DeleteRequestIn(FlagIn):
    REASONS: ClassVar[tuple] = db.DELETE_REASONS
    author: str = Field(default="anonymous", max_length=40)


class ReportIn(FlagIn):
    # No nickname. A report is addressed to the operator and read once; a byline
    # on it would only ever be a name to hold against somebody.
    REASONS: ClassVar[tuple] = db.REPORT_REASONS


class LinkIn(BaseModel):
    other_id: int


# --- helpers ------------------------------------------------------------
# 1,000 and 299,792,458 and 1,234.5678 -- but not 1,2,3 or 12,34, which are
# not thousands separators and are left alone.
_GROUPED_IN = re.compile(r"^(\d{1,3}(?:,\d{3})+)(\.\d+)?$")


def ungroup(value, grouped):
    """(value as stored, whether to draw it grouped).

    A separator never reaches the database, whatever the box says. 1000 and
    1,000 are one number and have to answer at one address, and the moment a
    comma is storable /n/1000 and /n/1%2C000 are two pages about it.

    Typing the commas is also how you ask for them. Stripping them and leaving
    the box off would swallow what the poster plainly meant, and the field
    always shows the stored value, so commas only ever appear by being typed.
    """
    value = (value or "").strip()
    m = _GROUPED_IN.match(value)
    if m:
        return m.group(1).replace(",", "") + (m.group(2) or ""), True
    return value, bool(grouped)


def resolve_format(value, given):
    """Parsed suggestion, unless the poster explicitly picked a format."""
    fmt, key = parse_number(value)
    if not given or given == fmt:
        return fmt, key
    if given in ("INTEGER", "DECIMAL"):
        try:
            return given, float(value)
        except ValueError:
            return given, None
    return given, None  # MIXED, or a TIME that is not actually a clock


# --- read ---------------------------------------------------------------
def _in_lang(con, lang, ids=None):
    """post_id -> that entry's title and body in `lang`, for the entries that
    have one. A post missing from this map is shown as it was written, which is
    the whole fallback: a reader asks for Korean and gets Korean where someone
    wrote it and the original everywhere else.

    translations.lang is COLLATE NOCASE, so "Korean" finds "korean" -- the same
    folding that keeps them from becoming two tabs.
    """
    if not lang or ids == []:
        return {}
    sql = "SELECT post_id, title, body FROM translations WHERE lang = ?"
    args = [lang]
    if ids is not None:
        sql += " AND post_id IN (%s)" % ",".join("?" * len(ids))
        args += ids
    return {r["post_id"]: r for r in con.execute(sql, args)}


@app.get("/api/languages")
def list_languages(con=Depends(get_db)):
    """Which languages the wiki can be read in, most-translated first. Derived
    from the translations themselves rather than a fixed list: the labels are
    free-form, so an enum here would offer "Japanese" to a wiki that says
    "日本語". Entries' own languages are not included -- picking one would
    show them exactly as Original already does.

    Joined to posts rather than read off translations alone: a language nothing
    visible is written in is not one the wiki can be read in, and leaving the
    join out put a hidden entry's language in the header's picker."""
    return [
        {"lang": r["lang"], "count": r["count"]}
        for r in con.execute(
            """SELECT t.lang, COUNT(*) AS count FROM translations t
               JOIN posts p ON p.id = t.post_id AND p.status = ?
               GROUP BY t.lang COLLATE NOCASE ORDER BY count DESC, t.lang""",
            (LIVE,),
        )
    ]


@app.get("/api/tags")
def list_tags(con=Depends(get_db)):
    """The wiki's working vocabulary: the tags in use, most-used first.

    Read off the posts rather than a list in this file. Anyone can coin a tag,
    so a fixed list would be a claim about what people are allowed to mean --
    and it was the only thing forcing two apps to agree on a literal.
    """
    return [
        {"tag": r["tag"], "count": r["count"]}
        for r in con.execute(
            """SELECT t.tag, COUNT(*) AS count FROM post_tags t
               JOIN posts p ON p.id = t.post_id AND p.status = ?
               GROUP BY t.tag ORDER BY count DESC, t.tag""",
            (LIVE,),
        )
    ]


@app.get("/api/numbers")
def list_numbers(
    format: Optional[str] = None,
    tag: Optional[str] = None,
    lang: Optional[str] = None,
    con=Depends(get_db),
):
    """The home index: one row per number, carrying the entries filed under it.

    A plain ordered scan grouped in Python rather than GROUP BY -- the list view
    wants the titles anyway, so aggregating and then re-querying for them would
    be two passes to build one thing. Body is truncated and image is only a
    flag: the index should be readable without opening a post, not a copy of it.
    """
    sql = ["""SELECT p.id, p.value, p.format, p.sort_key, p.title, p.likes,
                      p.grouped,
                      substr(p.body, 1, ?) AS body, p.image IS NOT NULL AS image
               FROM posts p"""]
    args = [BLURB + 1]
    if tag:
        sql.append("JOIN post_tags t ON t.post_id = p.id AND t.tag = ?")
        args.append(tag.lower())
    # A hidden entry gets no vote on how its number is written either: the row
    # is grouped only when every entry filed under it asked for separators, and
    # one taken down for vandalism was still voting against them.
    where = ["p.status = ?"]
    args.append(LIVE)
    if format:
        where.append("p.format = ?")
        args.append(format.upper())
    sql.append("WHERE " + " AND ".join(where))
    sql.append("ORDER BY p.sort_key IS NULL, p.sort_key, p.value, p.id")

    # Which language to read the index in is the reader's, not this endpoint's:
    # it used to hardcode English because 20 seeded entries are titled in Korean
    # and were unreadable to whoever wrote that. One flat lookup rather than a
    # join per row; the whole table is small and the join would need
    # de-duplicating anyway.
    shown_in = _in_lang(con, lang)

    out = []
    for r in con.execute("\n".join(sql), args):
        key = (r["value"], r["format"])
        if not out or (out[-1]["value"], out[-1]["format"]) != key:
            out.append({
                "value": r["value"],
                "format": r["format"],
                "sort_key": r["sort_key"],
                "bucket": bucket_of(r["sort_key"], r["format"]),
                # One row, several entries, one way to write the number. If the
                # people filing under it disagree about separators, the plain
                # form wins -- it is the one nobody had to opt into.
                "grouped": True,
                "entries": [],
            })
        out[-1]["grouped"] = out[-1]["grouped"] and bool(r["grouped"])
        shown = shown_in.get(r["id"]) or r
        body = shown["body"]
        out[-1]["entries"].append({
            "id": r["id"],
            "title": shown["title"],
            "body": body[:BLURB] + "\u2026" if len(body) > BLURB else body,
            "image": bool(r["image"]),
            "likes": r["likes"],   # a translation has no likes of its own
        })
    return out


@app.get("/api/posts")
def list_posts(
    value: Optional[str] = None,
    tag: Optional[str] = None,
    format: Optional[str] = None,
    q: Optional[str] = None,
    lang: Optional[str] = None,
    sort: str = "number",
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    con=Depends(get_db),
):
    sql = ["SELECT p.* FROM posts p"]
    args = []
    where = []
    if tag:
        sql.append("JOIN post_tags t ON t.post_id = p.id AND t.tag = ?")
        args.append(tag.lower())
    # after the join, before every other condition: the args have to line up
    # with the order the ? marks appear in the text
    where.append("p.status = ?")
    args.append(LIVE)
    if value is not None:
        where.append("p.value = ?")
        args.append(value)
    if format:
        where.append("p.format = ?")
        args.append(format.upper())
    if q:
        # EXISTS rather than a join: a post with three translations must still
        # come back once. Without it, giving a Korean entry an English title
        # left it unfindable in the language the site is written in.
        where.append(
            f"""(p.title LIKE ? ESCAPE '{db.LIKE_ESC}'
                 OR p.body LIKE ? ESCAPE '{db.LIKE_ESC}'
                 OR p.value LIKE ? ESCAPE '{db.LIKE_ESC}'
                 OR EXISTS (SELECT 1 FROM translations t
                            WHERE t.post_id = p.id
                              AND (t.title LIKE ? ESCAPE '{db.LIKE_ESC}'
                                   OR t.body LIKE ? ESCAPE '{db.LIKE_ESC}')))"""
        )
        args += [db.like(q)] * 5
    if where:
        sql.append("WHERE " + " AND ".join(where))
    order = {
        # last touched, not first written. On a wiki most of what happens is
        # someone rewriting an entry that has been there for a year, and
        # created_at makes all of it invisible. updated_at starts equal to
        # created_at and a restore sets it too, so this is one column, not a
        # MAX() -- and the card already says "edited" when the two differ.
        "recent": "p.updated_at DESC, p.id DESC",
        "top": "p.likes DESC, p.id DESC",
        "number": "p.sort_key IS NULL, p.sort_key, p.value, p.id",
        # for "show me anything" -- pair it with limit=1. RANDOM() sorts the
        # whole matched set, which is fine at this size and stays honest about
        # the filters: a random MOVIE is a random row of the movies.
        "random": "RANDOM()",
    }.get(sort, "p.id")
    sql.append("ORDER BY " + order)
    sql.append("LIMIT ? OFFSET ?")
    args += [limit, offset]
    posts = shape(con.execute("\n".join(sql), args).fetchall(), con)
    # Lists read in the reader's language; the single-post view does not, because
    # it has a tab strip and switching there is the reader's own move.
    shown_in = _in_lang(con, lang, [p["id"] for p in posts])
    for post in posts:
        tr = shown_in.get(post["id"])
        if tr:
            post["title"], post["body"] = tr["title"], tr["body"]
    return posts


@app.get("/api/posts/{post_id}")
def get_post(post_id: int, con=Depends(get_db)):
    post = fetch_one(con, post_id)
    rows = con.execute(
        """SELECT * FROM posts WHERE status = ? AND id IN (
             SELECT b_id FROM post_links WHERE a_id = ?
             UNION SELECT a_id FROM post_links WHERE b_id = ?)
           ORDER BY sort_key IS NULL, sort_key, value""",
        (LIVE, post_id, post_id),
    ).fetchall()
    post["related"] = shape(rows, con)
    return post


@app.get("/api/posts/{post_id}/revisions")
def list_revisions(post_id: int, con=Depends(get_db)):
    """The newest REVISIONS_SHOWN versions of an entry, each one whole.

    Capped because a snapshot is the entry in full, body and translations and
    all, and this list is what the edit form opens with: a few hundred edits
    turned opening the form into a several-megabyte download. Only the response
    is capped -- the rows stay in the table, since they are the only thing
    standing between vandalism and permanent loss, and reverting vandalism means
    reaching for a recent one.
    """
    guard_public(con, post_id)
    rows = con.execute(
        """SELECT id, author, at, snapshot FROM revisions WHERE post_id = ?
           ORDER BY id DESC LIMIT ?""",
        (post_id, REVISIONS_SHOWN),
    ).fetchall()
    return [
        {"id": r["id"], "author": r["author"], "at": r["at"],
         "snapshot": json.loads(r["snapshot"])}
        for r in rows
    ]


@app.get("/api/posts/{post_id}/comments")
def list_comments(post_id: int, con=Depends(get_db)):
    """What has been said beside this entry, newest first.

    Its own endpoint rather than a key on the post, because fetch_one is what
    snapshot() reads through -- anything attached there lands in every revision
    taken from then on, and a comment is not part of the entry.
    """
    guard_public(con, post_id)
    return [
        dict(r)
        for r in con.execute(
            """SELECT id, author, body, created_at FROM comments
               WHERE post_id = ? ORDER BY id DESC LIMIT ?""",
            (post_id, COMMENTS_SHOWN),
        )
    ]


# --- write --------------------------------------------------------------
@app.post("/api/posts", status_code=201)
def create_post(p: PostIn, who=Depends(guard), con=Depends(get_db)):
    value, grouped = ungroup(p.value, p.grouped)
    fmt, key = resolve_format(value, p.format)
    ts = now()
    with con:
        cur = con.execute(
            """INSERT INTO posts (value, format, sort_key, title, body, image, author,
                                  lang, grouped, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (value, fmt, key, p.title.strip(), p.body, p.image,
             p.author.strip() or "anonymous", p.lang, int(grouped), ts, ts),
        )
        write_tags(con, cur.lastrowid, p.tags)
        post_id = cur.lastrowid
        # A create has no prior state, so there is no snapshot to point at --
        # which is the whole reason the log is its own table and not a column on
        # revisions. Without this row a spammer's first twenty entries would be
        # invisible to the abuse view.
        events.record(con, "CREATE", client=who, who=p.author.strip() or "anonymous",
                      target_type="post", target_id=post_id, value=value)
    return fetch_one(con, post_id)


@app.patch("/api/posts/{post_id}")
def edit_post(post_id: int, p: PostPatch, who=Depends(guard), con=Depends(get_db)):
    current = fetch_one(con, post_id)
    # Which fields the caller actually sent. For image, null is a value -- it
    # is how the form removes one -- and defaulting it to None made "unchanged"
    # and "clear this" the same request, so Remove quietly did nothing.
    sent = p.model_dump(exclude_unset=True)
    with con:
        rev = snapshot(con, post_id, p.author.strip() or "anonymous")
        # the box has to be settled before the value is, since it decides
        # whether separators in what was typed are stripped or kept
        grouped = p.grouped if "grouped" in sent else bool(current["grouped"])
        value = current["value"]
        if p.value is not None:
            value, grouped = ungroup(p.value, grouped)
        if p.format:
            fmt, key = resolve_format(value, p.format)
        elif p.value is not None:
            fmt, key = resolve_format(value, None)  # number changed, re-derive
        else:
            fmt, key = current["format"], current["sort_key"]
        # author is the first writer and stays put -- on an open wiki, an edit
        # by a stranger must not erase who the entry came from.
        con.execute(
            """UPDATE posts SET value=?, format=?, sort_key=?, title=?, body=?,
                                image=?, lang=?, grouped=?, edited_by=?,
                                updated_at=? WHERE id=?""",
            (
                value, fmt, key,
                p.title.strip() if p.title is not None else current["title"],
                p.body if p.body is not None else current["body"],
                p.image if "image" in sent else current["image"],
                p.lang if "lang" in sent else current["lang"],
                int(grouped),
                p.author.strip() or "anonymous",
                now(), post_id,
            ),
        )
        if p.tags is not None:
            write_tags(con, post_id, p.tags)
        # which fields were sent, not which actually changed: the diff between
        # the snapshot and the row is where "changed" is answered, and there is
        # no point storing a worse copy of it here
        events.record(con, "EDIT", client=who, who=p.author.strip() or "anonymous",
                      target_type="post", target_id=post_id, revision_id=rev,
                      fields=sorted(sent))
    return fetch_one(con, post_id)


class RestoreIn(BaseModel):
    author: str = Field(default="anonymous", max_length=40)


@app.post("/api/posts/{post_id}/revisions/{rev_id}/restore")
def restore_revision(
    post_id: int,
    rev_id: int,
    body: RestoreIn = RestoreIn(),
    who=Depends(guard),
    con=Depends(get_db),
):
    guard_public(con, post_id)
    row = con.execute(
        "SELECT snapshot FROM revisions WHERE id = ? AND post_id = ?", (rev_id, post_id)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "revision not found")
    old = json.loads(row["snapshot"])
    author = body.author.strip() or "anonymous"
    alive = con.execute("SELECT 1 FROM posts WHERE id = ?", (post_id,)).fetchone()
    rev = None
    with con:
        if alive:
            rev = snapshot(con, post_id, author)  # restoring is itself undoable
            con.execute(
                """UPDATE posts SET value=?, format=?, sort_key=?, title=?, body=?,
                                    image=?, lang=?, grouped=?, edited_by=?,
                                    updated_at=? WHERE id=?""",
                (old["value"], old["format"], old["sort_key"], old["title"], old["body"],
                 old["image"], old.get("lang"), int(old.get("grouped") or 0),
                 author, now(), post_id),
            )
        else:
            # The post's row is gone, which only entries removed by the DELETE
            # route that used to exist can be: nothing removes a row now.
            # Snapshots outliving the post is the entire point of the revisions
            # table, so restore has to be able to put one back -- under its
            # original id, or every revision row and inbound link would be
            # pointing at nothing. There is nothing to snapshot first: the
            # delete already took one. It comes back ACTIVE, by the column's
            # default.
            con.execute(
                """INSERT INTO posts (id, value, format, sort_key, title, body, image,
                                      lang, grouped, author, edited_by, likes,
                                      created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (post_id, old["value"], old["format"], old["sort_key"], old["title"],
                 old["body"], old["image"], old.get("lang"),
                 int(old.get("grouped") or 0), old["author"], author,
                 old.get("likes", 0), old["created_at"], now()),
            )
        write_tags(con, post_id, old.get("tags", []))
        # a snapshot from before translations existed has none, and restoring it
        # says so -- the ones dropped are in the snapshot this restore just took
        write_translations(con, post_id, old.get("translations", []))
        events.record(con, "RESTORE", client=who, who=author, target_type="post",
                      target_id=post_id, revision_id=rev, restored=rev_id,
                      resurrected=not alive)
    return fetch_one(con, post_id)


@app.put("/api/posts/{post_id}/translations")
def put_translation(
    post_id: int, t: TranslationIn, client=Depends(guard), con=Depends(get_db)
):
    """Add this entry in another language, or rewrite the one already there."""
    fetch_one(con, post_id)  # 404 if the post is gone
    who = t.author.strip() or "anonymous"
    ts = now()
    with con:
        rev = snapshot(con, post_id, who)  # a translation is content, so undoable
        # UNIQUE(post_id, lang) turns a second write in the same language into an
        # edit. author is the first writer and stays put, as it does on a post.
        con.execute(
            """INSERT INTO translations
                   (post_id, lang, title, body, author, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(post_id, lang) DO UPDATE SET
                   title=excluded.title, body=excluded.body,
                   edited_by=excluded.author, updated_at=excluded.updated_at""",
            (post_id, t.lang, t.title, t.body, who, ts, ts),
        )
        events.record(con, "TRANSLATE", client=client, who=who, target_type="post",
                      target_id=post_id, revision_id=rev, lang=t.lang)
    return fetch_one(con, post_id)


@app.delete("/api/posts/{post_id}/translations/{tr_id}")
def delete_translation(
    post_id: int,
    tr_id: int,
    author: str = Query(default="anonymous", max_length=40),
    who=Depends(guard),
    con=Depends(get_db),
):
    with con:
        rev = snapshot(con, post_id, author.strip() or "anonymous")
        cur = con.execute(
            "DELETE FROM translations WHERE id = ? AND post_id = ?", (tr_id, post_id)
        )
        # Inside the block, not after it. Raising out here is what rolls the
        # snapshot back: the 404 used to be thrown once `with con` had already
        # committed, so a delete of a translation that was never there left a
        # revision behind saying somebody replaced the entry. Nothing had
        # happened, and the rows that stand between vandalism and permanent
        # loss are the wrong table to leave noise in -- REVISIONS_SHOWN is 50,
        # and every phantom pushes a real version out of the window the edit
        # form offers.
        if not cur.rowcount:
            raise HTTPException(404, "translation not found")
        events.record(con, "UNTRANSLATE", client=who,
                      who=author.strip() or "anonymous", target_type="post",
                      target_id=post_id, revision_id=rev, translation=tr_id)
    return fetch_one(con, post_id)


@app.post("/api/posts/{post_id}/like")
def like(post_id: int, _=Depends(guard), con=Depends(get_db)):
    # ponytail: the client's localStorage stops a reader double-counting by
    # accident, and the limiter above caps what a loop can do on purpose. An
    # ip-hash table is the next step if a count still looks farmed.
    #
    # Deliberately not recorded in events. A like is the one write that says
    # nothing about the entry, and at one row per tap the abuse view would be
    # nothing but likes -- the limiter is what answers a farmed count, and it
    # already has.
    fetch_one(con, post_id)  # before the counter moves, not after
    with con:
        con.execute("UPDATE posts SET likes = likes + 1 WHERE id = ?", (post_id,))
    return {"likes": fetch_one(con, post_id)["likes"]}


@app.delete("/api/posts/{post_id}/like")
def unlike(post_id: int, _=Depends(guard), con=Depends(get_db)):
    fetch_one(con, post_id)
    with con:
        con.execute(
            "UPDATE posts SET likes = MAX(likes - 1, 0) WHERE id = ?", (post_id,)
        )
    return {"likes": fetch_one(con, post_id)["likes"]}


@app.post("/api/posts/{post_id}/comments", status_code=201)
def add_comment(post_id: int, c: CommentIn, who=Depends(guard), con=Depends(get_db)):
    """The other write that lands beside an entry rather than in it.

    So no snapshot(), and updated_at is left alone: a remark is not a rewrite
    and must not carry the entry back up the Recent feed. Hands back the list
    rather than the one row, the way linking and translating hand back the post
    -- the caller has the new state without a second request.
    """
    fetch_one(con, post_id)  # 404 if the entry is gone
    with con:
        con.execute(
            "INSERT INTO comments (post_id, author, body, created_at) VALUES (?,?,?,?)",
            (post_id, c.author.strip() or "anonymous", c.body, now()),
        )
        # no revision_id: a comment takes no snapshot, which is the same reason
        # it is not on fetch_one
        events.record(con, "COMMENT", client=who, who=c.author.strip() or "anonymous",
                      target_type="post", target_id=post_id)
    return list_comments(post_id, con)


def _already_open(con, table, post_id, who, open_state):
    """Has this client already got something waiting on this entry?

    A count is only worth reading if it counts *people*: without this one
    visitor could file twenty reports and the moderation page would show an
    entry twenty people objected to.

    Keyed on the cookie when there is one and on the address only when there is
    not. An office, a school and a mobile carrier are each one address for
    hundreds of people, and refusing the second of them is a worse failure than
    a count a determined spammer can pad -- which the write limiter caps at
    twenty a minute anyway, and which the abuse view is for. In a table rather
    than a UNIQUE index because NULL is distinct from NULL in one, so the
    constraint would not hold for precisely the cookieless half.
    """
    col, val = ("client_hash", who["client_hash"]) if who["client_hash"] \
        else ("ip_hash", who["ip_hash"])
    return con.execute(
        f"SELECT 1 FROM {table} WHERE post_id = ? AND {col} = ? AND status = ?",
        (post_id, val, open_state),
    ).fetchone() is not None


@app.post("/api/posts/{post_id}/delete-request", status_code=201)
def request_deletion(
    post_id: int, r: DeleteRequestIn, who=Depends(guard), con=Depends(get_db)
):
    """Ask for an entry to go. Nobody can take one away, including whoever wrote
    it, so this is the only route that leads there -- and what it leads to is a
    person reading it, not a state change."""
    fetch_one(con, post_id)  # 404 on a missing or already hidden entry
    if _already_open(con, "delete_requests", post_id, who, "PENDING"):
        raise HTTPException(409, "you have already asked about this entry")
    with con:
        cur = con.execute(
            """INSERT INTO delete_requests
                   (post_id, reason, detail, requested_by, ip_hash, ua_hash,
                    client_hash, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (post_id, r.reason, r.detail.strip(), r.author.strip() or "anonymous",
             who["ip_hash"], who["ua_hash"], who["client_hash"], now()),
        )
        events.record(con, "DELETE_REQUEST", client=who,
                      who=r.author.strip() or "anonymous", target_type="request",
                      target_id=cur.lastrowid, post=post_id, reason=r.reason)
    return {"id": cur.lastrowid, "status": "PENDING"}


@app.post("/api/posts/{post_id}/report", status_code=201)
def report(post_id: int, r: ReportIn, who=Depends(guard), con=Depends(get_db)):
    """Say something is wrong with an entry without asking for it to go.

    Answers with the entry's open count, which is what the page can show back --
    and deliberately not with the reports themselves. They are addressed to the
    operator, and a public list of them is a second place to write abuse.
    """
    fetch_one(con, post_id)
    if _already_open(con, "reports", post_id, who, "OPEN"):
        raise HTTPException(409, "you have already reported this entry")
    with con:
        cur = con.execute(
            """INSERT INTO reports (post_id, reason, detail, ip_hash, ua_hash,
                                    client_hash, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (post_id, r.reason, r.detail.strip(), who["ip_hash"], who["ua_hash"],
             who["client_hash"], now()),
        )
        events.record(con, "REPORT", client=who, target_type="report",
                      target_id=cur.lastrowid, post=post_id, reason=r.reason)
        open_now = con.execute(
            "SELECT COUNT(*) FROM reports WHERE post_id = ? AND status = 'OPEN'",
            (post_id,),
        ).fetchone()[0]
    return {"id": cur.lastrowid, "open": open_now}


@app.post("/api/posts/{post_id}/links", status_code=201)
def add_link(post_id: int, link: LinkIn, who=Depends(guard), con=Depends(get_db)):
    if link.other_id == post_id:
        raise HTTPException(400, "a post cannot link to itself")
    fetch_one(con, post_id)
    fetch_one(con, link.other_id)
    a, b = sorted((post_id, link.other_id))
    with con:
        con.execute("INSERT OR IGNORE INTO post_links (a_id, b_id) VALUES (?,?)", (a, b))
        events.record(con, "LINK", client=who, target_type="post",
                      target_id=post_id, other=link.other_id)
    return get_post(post_id, con)


@app.delete("/api/posts/{post_id}/links/{other_id}")
def remove_link(post_id: int, other_id: int, who=Depends(guard), con=Depends(get_db)):
    fetch_one(con, post_id)
    a, b = sorted((post_id, other_id))
    with con:
        cur = con.execute("DELETE FROM post_links WHERE a_id = ? AND b_id = ?", (a, b))
        # Only if something was actually unlinked. `events` is append-only by
        # design, so a row for a link that was never there cannot be tidied up
        # later -- and it counts towards the client's writes in /api/admin/abuse,
        # which is the number a block gets decided on. The sibling routes here
        # already guard on rowcount; this one did not.
        if cur.rowcount:
            events.record(con, "UNLINK", client=who, target_type="post",
                          target_id=post_id, other=other_id)
    return get_post(post_id, con)


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), who=Depends(guard),
                 con=Depends(get_db)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"allowed types: {', '.join(sorted(ALLOWED_EXT))}")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "max 5 MB")
    # 507, not 413: the file is fine, the wiki is full. Say so, or the poster
    # spends the afternoon shrinking a photo that was never the problem.
    if uploads_bytes() + len(data) > UPLOAD_TOTAL_MAX:
        raise HTTPException(507, "the wiki is out of room for pictures -- nothing "
                                 "to do with your file. Tell whoever runs it.")
    name = uuid4().hex + ext  # server-generated name: no user-controlled path
    with open(os.path.join(UPLOAD_DIR, name), "wb") as fh:
        fh.write(data)
    # Recorded even though there is no entry to attach it to yet: an upload is
    # the write that costs disk, and at 5 MB a file it is the one worth seeing
    # in the abuse view before the ceiling is what tells you.
    with con:
        events.record(con, "UPLOAD", client=who, bytes=len(data), name=name)
    return {"url": f"/uploads/{name}"}


# --- the built front end ------------------------------------------------
# Declared last on purpose: Starlette matches routes in the order they are
# added, so every /api route above wins before the catch-all below sees a
# request. In development none of this runs -- Vite serves the app and proxies
# /api here -- which is why the injection is covered by a test rather than by
# looking at it.

OG_STRIP = [
    (re.compile(r"```[\s\S]*?```"), " "),        # fenced code
    (re.compile(r"^\s{0,3}#{1,6}\s+", re.M), ""),  # headings
    (re.compile(r"^\s{0,3}>\s?", re.M), ""),       # quotes
    (re.compile(r"^\s{0,3}[-*+]\s+", re.M), ""),   # bullets
    (re.compile(r"!?\[([^\]]*)\]\([^)]*\)"), r"\1"),  # links and images
    (re.compile(r"[*`~]"), ""),
    (re.compile(r"\s+"), " "),
]
OG_DESC = 200


def og_summary(body: str) -> str:
    """A markdown body as one line of prose, for a share card.

    A second, simpler cousin of plain() in the front end's api.ts. They are not
    kept in step and do not need to be: one feeds a preview row, the other a
    meta tag, and nobody sees both at once. Neither is a parser.
    """
    for rx, sub in OG_STRIP:
        body = rx.sub(sub, body)
    body = body.strip()
    return body[: OG_DESC - 1] + "…" if len(body) > OG_DESC else body


def og_head(page: str, post: dict, base: str) -> str:
    """Give this page the entry's own title, description and image.

    Crawlers do not run the JavaScript that would set these client-side, so the
    <head> has to arrive already written -- which is the whole reason the API
    serves the front end at all.
    """
    value = grouped_value(post["value"], post["grouped"])
    title = f"{value} — {post['title']} · Namba"
    desc = og_summary(post["body"]) or f"What {value} means, on Namba."
    img = f"{base}{post['image'].lstrip('/')}" if post["image"] else None
    tags = [
        ("og:type", "article"),
        ("og:site_name", "Namba"),
        ("og:title", title),
        ("og:description", desc),
        ("og:url", f"{base}p/{post['id']}"),
        ("twitter:card", "summary_large_image" if img else "summary"),
    ]
    if img:
        tags.append(("og:image", img))
    meta = "\n    ".join(
        f'<meta property="{k}" content="{html.escape(v, quote=True)}" />' for k, v in tags
    )
    esc = html.escape(title, quote=True)
    # Both replacements are callables rather than strings, and that is not a
    # style choice: re.sub reads a *string* replacement for group references, so
    # a title carrying a backslash -- "C:\1\2" is a fine thing to write an entry
    # about -- raised `invalid group reference` and answered this page with a
    # 500 for good. html.escape does not touch a backslash and should not; it is
    # escaping for HTML, and this was a regex problem wearing its clothes. A
    # callable is handed the match and its return value is used verbatim.
    # replaced, not appended: two <title>s and the browser keeps the first
    page = re.sub(r"<title>.*?</title>", lambda _: f"<title>{esc}</title>",
                  page, count=1, flags=re.S)
    page = re.sub(
        r'<meta name="description" content=".*?"\s*/?>',
        lambda _: f'<meta name="description" content="{html.escape(desc, quote=True)}" />',
        page, count=1, flags=re.S,
    )
    return page.replace("</head>", f"  {meta}\n  </head>", 1)


def _index(con, path: str, base: str) -> HTMLResponse:
    with open(os.path.join(DIST, "index.html"), encoding="utf-8") as fh:
        page = fh.read()
    hit = re.fullmatch(r"p/(\d+)", path)
    if hit:
        row = con.execute("SELECT * FROM posts WHERE id = ? AND status = ?",
                          (hit.group(1), LIVE)).fetchone()
        if row:
            page = og_head(page, dict(row), base)
    return HTMLResponse(page)


@app.get("/{path:path}")
def spa(path: str, request: Request, con=Depends(get_db)):
    if not os.path.isdir(DIST):
        raise HTTPException(404, "front end not built; run npm run build")
    # The back office is its own document with its own bundle, so /admin and
    # everything under it get admin.html rather than the wiki's index.html.
    # Before the asset lookup, which would never match these anyway: the built
    # assets live under /assets/. No og:head written and no namba_cid set --
    # nothing here is shareable and an operator is not a visitor being counted.
    if path == "admin" or path.startswith("admin/"):
        page = os.path.join(DIST, "admin.html")
        if not os.path.isfile(page):
            raise HTTPException(404, "back office not built; run npm run build")
        return FileResponse(page)
    # An /api path that reached here is one no route above matched, and the
    # catch-all must not answer it with the front end: a client that mistyped
    # an endpoint got 200 and a page of HTML where it expected JSON, which is
    # a worse answer than a 404 in every case and an unreadable one for the
    # "open, no key" API the footer advertises.
    if path == "api" or path.startswith("api/"):
        raise HTTPException(404, "no such endpoint")
    # A built asset if it is one, index.html otherwise -- /n/42 and /p/12 are
    # the client's routes, not files. realpath before serving: "path" comes off
    # the wire and ".." in it must not walk out of dist.
    if path:
        target = os.path.realpath(os.path.join(DIST, path))
        if target.startswith(os.path.realpath(DIST) + os.sep) and os.path.isfile(target):
            return FileResponse(target)
    res = _index(con, path, str(request.base_url))
    # The one place the client cookie is set: on the document, and only when
    # there is not one already. A middleware would set it on every asset of the
    # first page load and the last one to arrive would win; here a page load
    # sets it once. httponly because nothing in the front end reads it -- it
    # exists so the operator can tell a spammer on a fresh address from a fresh
    # visitor, and it is advisory either way, since clearing it is a click.
    # In development Vite serves the document, so there is no cookie and the
    # abuse view has the IP hash alone. That is the same answer it falls back to
    # for anyone who clears theirs.
    if events.COOKIE not in request.cookies:
        res.set_cookie(events.COOKIE, uuid4().hex, max_age=events.COOKIE_MAX_AGE,
                       httponly=True, samesite="lax", path="/")
    return res
