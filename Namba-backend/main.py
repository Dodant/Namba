"""Namba API -- an open, no-login wiki of numbers."""
import html
import json
import os
import re
import time
from collections import defaultdict
from typing import ClassVar, List, Optional
from urllib.parse import quote, unquote
from uuid import uuid4
from xml.sax.saxutils import escape as xml_escape

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse, HTMLResponse, PlainTextResponse, Response,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

import admin_api
import db
import events
import seo_locale
from db import get_db, now
from store import (
    LIVE, fetch_one, guard_public, shape, snapshot, write_tags, write_translations,
)
from numfmt import (
    FORMATS, bucket_of, canonical_value, grouped_value, is_abbr, parse_number,
)

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
# What every canonical, og:url and <loc> is built on. Normally the address the
# request arrived at, which is what keeps this repo free of a hardcoded domain
# and lets the same build answer on localhost and in production. Set
# NAMBA_BASE_URL behind a reverse proxy that does not pass X-Forwarded-Proto:
# without one of the two, every canonical on an https site says http.
BASE = os.environ.get("NAMBA_BASE_URL")
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


def site_base(request) -> str:
    """The site's own origin, with a trailing slash.

    One answer for the canonical tags, robots.txt and the sitemap, so the three
    cannot disagree about what this site is called.
    """
    return (BASE or str(request.base_url)).rstrip("/") + "/"


UI_LOCALES = {"en", "ko", "ja", "zh-Hans", "es", "fr", "de"}
UI_LOCALE_COOKIE = "namba_ui_locale"


def _ui_locale(raw):
    """One supported UI locale from a cookie or Accept-Language token."""
    code = (raw or "").strip().lower()
    if code.startswith("zh"):
        return "zh-Hans"
    base = code.split("-", 1)[0]
    return base if base in UI_LOCALES else None


def request_ui_locale(request):
    """The punctuation to use in server-written titles and share cards.

    The explicit interface choice is mirrored to a small cookie by the client.
    Before that exists, the browser's ordered Accept-Language list is the only
    preference available to a server or link-preview crawler.
    """
    chosen = _ui_locale(request.cookies.get(UI_LOCALE_COOKIE))
    if chosen:
        return chosen
    weighted = []
    for position, part in enumerate(request.headers.get("accept-language", "").split(",")):
        token, *params = part.strip().split(";")
        quality = 1.0
        for param in params:
            if param.strip().startswith("q="):
                try:
                    quality = float(param.strip()[2:])
                except ValueError:
                    quality = 0
        weighted.append((-quality, position, token))
    for quality, _, token in sorted(weighted):
        if quality == 0:
            continue
        chosen = _ui_locale(token)
        if chosen:
            return chosen
    return "en"


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
# When to throw away the addresses that have stopped writing. Nothing here
# expired a key, only the timestamps inside one, so every IP hash that ever
# posted stayed in the dict for the life of the process -- a slow leak on the
# one structure that is per-worker and never looked at again. Swept in bulk
# rather than per request because the sweep is O(keys) and the common case is
# a dict of forty. Nothing is lost by dropping a key: an absent one and one
# holding an empty list are the same answer, since a defaultdict rebuilds it.
# auth._attempts has the same shape and repeats these two lines -- auth may
# not import main, and a shared home for them would be worse than the repeat.
KEEP_CLIENTS = 10_000


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
    if len(_writes) > KEEP_CLIENTS:
        for k in [k for k, v in _writes.items() if not v or v[-1] <= cutoff]:
            del _writes[k]
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
    number_locale: Optional[str] = Field(default=None, max_length=16)
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
    number_locale: Optional[str] = Field(default=None, max_length=16)
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
def ungroup(value, grouped, locale="en"):
    """(value as stored, whether to draw it grouped).

    A separator never reaches the database, whatever the box says. 1000,
    English 1,000, German 1.000 and French 1 000 are one number and have to
    answer at one address.

    Typing the grouping mark is also how you ask for it. Stripping it and
    leaving the box off would swallow what the poster plainly meant.
    """
    value, typed_grouping = canonical_value(value, locale)
    return value, bool(grouped or typed_grouping)


def resolve_format(value, given, con, self_id=None):
    """(value as stored, format, sort_key). The parsed suggestion, unless the
    poster explicitly picked a format.

    It hands the value back because settling the format is what settles how the
    value is spelled: an ABBR has one spelling per word, so "ufo", "Ufo" and
    "UFO" are one abbreviation at one address. Same argument `ungroup` makes
    about commas -- the moment two spellings are storable, /a/UFO and /a/ufo
    are two pages about one word, and there is no login here to merge them
    afterwards. The spelling is the first writer's rather than upper-case,
    because SaaS and IoT are abbreviations too and SAAS is not how anyone
    writes them: a later writer adopts what is already stored, whatever its
    status, and only an entry with no sibling keeps what it typed. `self_id`
    leaves the entry being edited out of that lookup, so the one entry about a
    word can still correct its own case.

    It is also where ABBR is checked rather than taken at its word. Every other
    format is a way of reading what was typed and cannot be wrong about it; this
    one is a claim about the value, and with no login the claim is a stranger's.
    Both writes settle the format here -- create with what was typed, edit with
    what is stored, since the number field is read-only once the entry exists --
    so this is the one place that catches both.
    """
    fmt, key = parse_number(value)
    if given and given != fmt:
        if given in ("INTEGER", "DECIMAL"):
            try:
                key = float(value)
            except ValueError:
                key = None
        else:
            key = None  # MIXED, ABBR, or a TIME that is not actually a clock
        fmt = given
    if fmt == "ABBR":
        if not is_abbr(value):
            raise HTTPException(
                422, "an abbreviation is Latin letters, and needs at least one "
                     "-- UFO, CSI, R&D, MP3. Anything else is another format.")
        value = value.strip()
        first = con.execute(
            "SELECT value FROM posts WHERE format = 'ABBR' AND value = ? COLLATE NOCASE "
            "AND id IS NOT ? ORDER BY id LIMIT 1", (value, self_id)).fetchone()
        if first:
            value = first["value"]
    return value, fmt, key


def section_where(section, prefix=""):
    """SQL for "this is an abbreviation" / "this is a number", or None for both.

    /n/ and /a/ are two sections over one column. An entry is one or the other
    and has exactly one address, so a value filed under both -- somebody
    choosing Mixed for UFO on purpose -- is two entries at two addresses rather
    than one entry showing up twice. One function decides it, so the list
    endpoint, the two <head>s and the sitemap cannot answer differently.

    An unknown section filters nothing, the same way an unknown `sort` falls
    back rather than 422ing: a typo either side of the wire is a page that
    shows too much, not a page that breaks.
    """
    op = {"number": "!=", "abbr": "="}.get(section or "")
    return f"{prefix}format {op} 'ABBR'" if op else None


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
    join out would put a hidden entry's language in the footer's content picker."""
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
                "bucket": bucket_of(r["sort_key"], r["format"], r["value"]),
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
    section: Optional[str] = None,
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
        # an abbreviation is one word however a link spells it -- see
        # resolve_format; a Mixed "gross" and "GROSS" stay two values
        loose = section == "abbr" or (format or "").upper() == "ABBR"
        where.append("p.value = ? COLLATE NOCASE" if loose else "p.value = ?")
        args.append(value)
    if format:
        where.append("p.format = ?")
        args.append(format.upper())
    # what tells /n/42 from /a/UFO -- see section_where()
    in_section = section_where(section, "p.")
    if in_section:
        where.append(in_section)
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
    value, grouped = ungroup(p.value, p.grouped, p.number_locale)
    value, fmt, key = resolve_format(value, p.format, con)
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
    # Input grammar, not entry content: it must not appear as a changed field
    # in the audit log or a revision diff.
    sent.pop("number_locale", None)
    # the same rule from the other side -- "Written in" is a menu of every
    # language, and one of them may already be a tab on this entry
    if "lang" in sent and says_it_twice(p.lang, [t["lang"] for t in current["translations"]]):
        raise HTTPException(422, "the entry already has a version in that language")
    with con:
        rev = snapshot(con, post_id, p.author.strip() or "anonymous")
        # the box has to be settled before the value is, since it decides
        # whether separators in what was typed are stripped or kept
        grouped = p.grouped if "grouped" in sent else bool(current["grouped"])
        value = current["value"]
        if p.value is not None:
            value, grouped = ungroup(p.value, grouped, p.number_locale)
        if p.format:
            value, fmt, key = resolve_format(value, p.format, con, post_id)
        elif p.value is not None:
            value, fmt, key = resolve_format(value, None, con, post_id)  # value changed, re-derive
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


def says_it_twice(lang, others) -> bool:
    """Whether `lang` is already how this entry reads somewhere else.

    One language, one tab. The entry's own language and a translation into it
    are the entry twice, and the tab bar has no way to tell the reader which of
    the two it is offering -- PostForm has kept a translation off that menu
    since the panel existed, and this is the same rule where the API can see
    it: the wiki's API is open and no key, so a rule that lives only in a form
    is a rule for the one client that happens to use the form.

    Case-folded, because translations.lang is COLLATE NOCASE and "korean" and
    "Korean" are already one row there. posts.lang is not, and it is not going
    to be the way around it.
    """
    a = (lang or "").strip().casefold()
    return bool(a) and any(a == (o or "").strip().casefold() for o in others)


@app.put("/api/posts/{post_id}/translations")
def put_translation(
    post_id: int, t: TranslationIn, client=Depends(guard), con=Depends(get_db)
):
    """Add this entry in another language, or rewrite the one already there."""
    post = fetch_one(con, post_id)  # 404 if the post is gone
    # before the snapshot, not inside it: a request that changes nothing must
    # not leave a revision behind saying somebody replaced the entry
    if says_it_twice(t.lang, [post["lang"]]):
        raise HTTPException(422, "the entry is already written in that language")
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
# How many entry titles a list page's description names before it counts the
# rest. Four fit inside OG_DESC beside the number and still read as a sentence;
# a description that lists forty is a keyword list, not an answer to anything.
DESC_TITLES = 4
# Schema.org asks for a headline of 110 characters or fewer; a title here may
# be 200. Clipped rather than dropped, since the whole of it is in `name` and
# in the <title> either way.
HEADLINE = 110
# The waiver the footer states and the form's Publish button repeats. In the
# head as well now, because a machine reading this wiki should not have to
# infer whether it may quote it.
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
# The card a page falls back to when it has no picture of its own -- which is
# every page: not one entry in this wiki has an image, so this is not the
# exception, it is what a pasted Namba link looks like in Slack, on Twitter and
# in iMessage. There is no route for it here. It is a file in the front end's
# public/, so Vite copies it to dist/ and the catch-all at the bottom serves it
# like any other build output; test_the_share_card_is_a_real_png keeps it
# 1200x630, which is the size the scrapers crop from.
OG_CARD = "og.png"


def clip(s: str, n: int = OG_DESC) -> str:
    """A line of prose, no longer than n, ending in an ellipsis if it was."""
    return s[: n - 1].rstrip() + "…" if len(s) > n else s


def og_summary(body: str) -> str:
    """A markdown body as one line of prose, for a share card.

    A second, simpler cousin of plain() in the front end's api.ts. They are not
    kept in step and do not need to be: one feeds a preview row, the other a
    meta tag, and nobody sees both at once. Neither is a parser.
    """
    for rx, sub in OG_STRIP:
        body = rx.sub(sub, body)
    return clip(body.strip())


def enc(seg: str) -> str:
    """One path segment, percent-encoded exactly as encodeURIComponent is.

    entryPath() and tagPath() in api.ts build every /n/, /a/ and /t/ link that
    way.
    A canonical or a <loc> encoding it differently is a second URL for one
    page -- and on a wiki whose values include 11/22/63 and 9¾, that is most
    of them. The safe set below is encodeURIComponent's, character for
    character.
    """
    return quote(seg, safe="-_.!~*'()")


def value_path(fmt: str, value: str) -> str:
    """Where an entry's value is read: /a/UFO for an abbreviation, /n/42 for a
    number. The twin of entryPath() in api.ts, and the reason both exist is
    that a format decides an address -- get it from the row, never guess it
    from the characters.
    """
    return f"{'a' if fmt == 'ABBR' else 'n'}/{enc(value)}"


def path_seg(request, prefix: str) -> Optional[str]:
    """The one segment after /n/, /a/ or /t/, as the reader typed it.

    Read off the raw path rather than the decoded one the router hands us,
    because a value may contain a slash: 11/22/63 is a date and a number here,
    and by the time ASGI has decoded the path, "n/11%2F22%2F63" and a
    three-segment path are the same string. This is the same trap the front end
    documents -- always pass a value to the API as a query param, never as a
    path segment -- reached from the other side.

    Exactly one segment, so /n/42/anything is not /n/42. The client's router
    does not match that either, and a page which does not exist must not be
    handed a canonical claiming it does.
    """
    raw = request.scope.get("raw_path") or request.scope["path"].encode()
    rest = raw.decode("utf-8", "replace").split("?", 1)[0].lstrip("/")
    if not rest.startswith(prefix) or "/" in rest[len(prefix):]:
        return None
    return unquote(rest[len(prefix):]) or None


def json_ld(data) -> str:
    """JSON-LD as it may safely sit inside a <script> in this document.

    Every "<" is escaped, not the closing tag alone: an entry title is written
    by a stranger, and "</script>" inside a JSON string ends the block for the
    HTML parser whatever the JSON makes of it. ensure_ascii off, so a Korean
    title stays legible to anything reading the source.
    """
    return json.dumps(
        data, ensure_ascii=False, separators=(",", ":")
    ).replace("<", "\\u003c")


def write_head(page: str, *, title=None, desc=None, canonical=None,
               robots=None, og=(), ld=None, locale="en") -> str:
    """Put this page's own head into the built index.html.

    One writer for all six public routes. Title and description are *replaced*
    -- two <title>s and the browser keeps the first -- and everything else is
    appended before </head>.

    Both substitutions pass a callable rather than a string, and that is not a
    style choice: re.sub reads a *string* replacement for group references, so
    a title carrying a backslash -- "C:\\1\\2" is a fine thing to write an entry
    about -- raised `invalid group reference` and answered this page with a 500
    for good. html.escape does not touch a backslash and should not; it is
    escaping for HTML, and this was a regex problem wearing its clothes.
    """
    # The first response has to identify its language before React runs. This
    # is also what crawlers and assistive technology read; the client keeps it
    # in step when a person changes the interface language without a reload.
    page, changed = re.subn(
        r'(<html\b[^>]*\blang=")[^"]*(")',
        lambda hit: (
            f"{hit.group(1)}{html.escape(locale, quote=True)}{hit.group(2)}"
        ),
        page, count=1, flags=re.I,
    )
    if not changed:
        page = re.sub(
            r"<html\b", f'<html lang="{html.escape(locale, quote=True)}"',
            page, count=1, flags=re.I,
        )
    if title is not None:
        esc = html.escape(title, quote=True)
        page = re.sub(r"<title>.*?</title>", lambda _: f"<title>{esc}</title>",
                      page, count=1, flags=re.S)
    if desc is not None:
        d = html.escape(desc, quote=True)
        page = re.sub(
            r'<meta name="description" content=".*?"\s*/?>',
            lambda _: f'<meta name="description" content="{d}" />',
            page, count=1, flags=re.S,
        )
    out = []
    if canonical:
        out.append(f'<link rel="canonical" href="{html.escape(canonical, quote=True)}" />')
    if robots:
        out.append(f'<meta name="robots" content="{robots}" />')
    for k, v in og:
        # og: is RDFa and wants property=; twitter: is not and wants name=. It
        # was property= on both, which Twitter tolerates and a validator does
        # not.
        attr = "name" if k.startswith("twitter:") else "property"
        out.append(f'<meta {attr}="{k}" content="{html.escape(v, quote=True)}" />')
    if ld:
        out.append(f'<script type="application/ld+json">{json_ld(ld)}</script>')
    if not out:
        return page
    return page.replace("</head>", "  " + "\n    ".join(out) + "\n  </head>", 1)


def og_tags(title, desc, url, kind, base, image=None, locale="en"):
    """The share card.

    twitter:card alone beside the og: tags: Twitter reads og:title,
    og:description and og:image when its own are missing, so a second copy of
    each would be three more lines saying the same thing.

    Always the large card now, because there is always an image: an entry's own
    picture when it has one, and OG_CARD when it does not. It used to be the
    small "summary" card with no picture at all, which described every page on
    the site -- a pasted link came out a bare grey rectangle with the title
    beside it.

    og:image:alt only for the fallback. It says what that card actually reads,
    which is a thing this file knows. An entry's uploaded picture has no alt
    text stored anywhere, and the title is a caption for the entry rather than
    a description of the image, so writing one from it would be inventing it.
    """
    alt = None
    if not image:
        image, alt = f"{base}{OG_CARD}", seo_locale.words(locale)["image_alt"]
    tags = [("og:type", kind), ("og:site_name", "Namba"),
            ("og:locale", seo_locale.OG_LOCALES[locale]),
            ("og:title", title), ("og:description", desc), ("og:url", url),
            ("twitter:card", "summary_large_image"), ("og:image", image)]
    tags.extend(
        ("og:locale:alternate", code)
        for name, code in seo_locale.OG_LOCALES.items() if name != locale
    )
    if alt:
        tags.append(("og:image:alt", alt))
    return tags


def site_ld(base, locale="en"):
    """The wiki itself, as the thing every other page says it belongs to.

    Given an @id so the four page types point at one node rather than each
    describing a separate website that happens to share a name.
    """
    return {"@type": "WebSite", "@id": f"{base}#site", "name": "Namba",
            "url": base, "inLanguage": locale, "license": CC0}


def crumbs(base, trail):
    """Namba, then the way down to here. The site is always the first crumb."""
    items = [("Namba", base)] + list(trail)
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": i, "name": name, "item": url}
                for i, (name, url) in enumerate(items, 1)]}


def head_home(page, base, locale="en"):
    """The front page: the wiki, and the fact that it can be searched."""
    text = seo_locale.words(locale)
    title, desc = text["site_title"], text["site_desc"]
    ld = dict(site_ld(base, locale), **{
        "@context": "https://schema.org",
        "description": desc,
        "potentialAction": {
            "@type": "SearchAction",
            # a real route: the header's search form navigates to exactly this
            "target": {"@type": "EntryPoint",
                       "urlTemplate": f"{base}search?q={{search_term_string}}"},
            "query-input": "required name=search_term_string",
        },
    })
    # canonical is the bare base on purpose. ?view=feed, ?format= and ?tag= all
    # re-sort or filter the same index, and ?tag=book is the page /t/book
    # already is -- four addresses for one page, and this says which of them.
    return write_head(
        page, title=title, desc=desc, canonical=base, ld=[ld], locale=locale,
        og=og_tags(title, desc, base, "website", base=base, locale=locale),
    )


def head_guide(page, base, locale="en"):
    """The rules page: the one route here that is prose rather than a query.

    Indexable, which makes it the exception to _index()'s default and the
    reason that default is spelled out down there. Everything else it declines
    to index is a control (/random), a form (/new, /p/{id}/edit) or a path that
    does not exist. This is a page, it is the same page for everybody, and it
    is the one that says what the wiki will and will not keep -- which is what
    somebody searching for whether their number belongs here is looking for.

    Its own title and description rather than the site's blurb: a search result
    for this page that repeated the home page description
    would be indistinguishable from the front page.
    """
    url = base + "guide"
    text = seo_locale.words(locale)
    title, desc = text["guide_title"], text["guide_desc"]
    return write_head(
        page, title=title, desc=desc, canonical=url, locale=locale,
        og=og_tags(title, desc, url, "article", base=base, locale=locale),
        ld=[crumbs(base, [(text["guide_name"], url)])],
    )


def head_list(page, base, *, kind, subject, url, rows, locale="en"):
    """A page that is a list of entries: /n/{value}, /a/{value} or /t/{tag}.

    One shape for both, because they are one component in the front end for the
    same reason -- they differ only in which filter found the rows.

    An empty one is noindex. It is a real page and it invites you to write the
    first entry, but there is nothing on it to answer a search with, and /n/ is
    an open set: indexing /n/999999 would put an unbounded number of blank
    pages in front of the ones that say something.
    """
    if not rows:
        # a card even so. noindex is about a search result; a share card is
        # what a chat window draws, and the two do not consult each other --
        # "nobody has written about 1234 yet, want to?" is a link somebody
        # pastes on purpose, and it should not paste as a grey box.
        title = f"{subject} · Namba"
        empty = seo_locale.empty_summary(kind, subject, locale)
        return write_head(page, title=title, desc=empty, canonical=url,
                          robots="noindex, follow",
                          og=og_tags(title, empty, url, "website", base=base,
                                     locale=locale), locale=locale)
    n = len(rows)
    titles = [r["title"] for r in rows[:DESC_TITLES]]
    desc = clip(seo_locale.list_summary(kind, subject, titles, n, locale))
    title = seo_locale.list_title(subject, n, locale)
    page_ld = {
        "@context": "https://schema.org", "@type": "CollectionPage",
        "name": title, "url": url, "description": desc, "inLanguage": locale,
        "license": CC0, "isPartOf": site_ld(base, locale),
        "about": {"@type": "Thing", "name": subject},
        # the list is the page. Names as well as urls, because anything that
        # does not run the JavaScript has this and the description and nothing
        # else to tell it what is filed here.
        "mainEntity": {
            "@type": "ItemList", "numberOfItems": n,
            "itemListElement": [
                {"@type": "ListItem", "position": i,
                 "url": f"{base}p/{r['id']}", "name": r["title"]}
                for i, r in enumerate(rows, 1)],
        },
    }
    return write_head(page, title=title, desc=desc, canonical=url, locale=locale,
                      og=og_tags(title, desc, url, "website", base=base,
                                 locale=locale),
                      ld=[page_ld, crumbs(base, [(subject, url)])])


def head_number(con, page, value, base, locale="en"):
    rows = [dict(r) for r in con.execute(
        "SELECT id, title, grouped FROM posts WHERE value = ? AND status = ? "
        f"AND {section_where('number')} ORDER BY id", (value, LIVE))]
    # the rule the hero draws by: separators are a per-entry display flag, so
    # the page only groups when every entry filed under the number agrees
    shown = grouped_value(
        value, bool(rows) and all(r["grouped"] for r in rows), locale,
    )
    return head_list(page, base, kind="number", subject=shown,
                     url=f"{base}n/{enc(value)}", rows=rows, locale=locale)


def head_abbr(con, page, value, base, locale="en"):
    """The same page for the other section. Separate from head_number because
    the two say different words -- what a number means, what an abbreviation
    stands for -- and because a value stored as one is not filed under the
    other. No grouped_value: there is no thousand in UFO.
    """
    # /a/ufo is a link to the one abbreviation however it was typed, and the
    # page and its canonical say the spelling that is stored, not the link's
    rows = [dict(r) for r in con.execute(
        "SELECT id, title, value FROM posts WHERE value = ? COLLATE NOCASE "
        f"AND status = ? AND {section_where('abbr')} ORDER BY id", (value, LIVE))]
    if rows:
        value = rows[0]["value"]
    return head_list(page, base, kind="abbreviation", subject=value,
                     url=f"{base}a/{enc(value)}", rows=rows, locale=locale)


def head_tag(con, page, tag, base, locale="en"):
    tag = tag.lower()  # tagLabel() folds these, and /t/BOOK is an old link
    rows = [dict(r) for r in con.execute(
        "SELECT p.id, p.title FROM posts p JOIN post_tags t ON t.post_id = p.id "
        "WHERE t.tag = ? AND p.status = ? ORDER BY p.id", (tag, LIVE))]
    return head_list(page, base, kind="tag", subject=tag,
                     url=f"{base}t/{enc(tag)}", rows=rows, locale=locale)


def og_head(page: str, post: dict, base: str, tags=(), locale="en") -> str:
    """Give this page the entry's own title, description, dates and picture.

    Crawlers do not run the JavaScript that would set these client-side, so the
    <head> has to arrive already written -- which is the whole reason the API
    serves the front end at all.

    The JSON-LD is where this entry's provenance lives. On screen the byline is
    behind the Credits toggle and every date is relative by design ("2 days
    ago"), so an exact ISO timestamp belongs in a machine's channel rather than
    as a second date format nobody asked to read.
    """
    value = grouped_value(post["value"], post["grouped"], locale)
    title = f"{value} — {post['title']} · Namba"
    # The fallback names the entry, because 84% of this wiki is a title and no
    # body and "What 2 means, on Namba." was the description on all of them --
    # identical, word for word, on the 29 that share a number. A description
    # that cannot tell two pages apart is one a search engine drops.
    desc = og_summary(post["body"]) or clip(seo_locale.post_summary(
        post["title"], value, post["format"] == "ABBR", locale,
    ))
    img = f"{base}{post['image'].lstrip('/')}" if post["image"] else None
    url = f"{base}p/{post['id']}"
    article = {
        "@context": "https://schema.org", "@type": "Article",
        "headline": clip(post["title"], HEADLINE), "name": title,
        "description": desc, "url": url, "mainEntityOfPage": url,
        "datePublished": post["created_at"], "dateModified": post["updated_at"],
        # author is the first writer and is never overwritten; an editor is a
        # separate key here for the same reason it is a separate column.
        "author": {"@type": "Person", "name": post["author"]},
        "about": {"@type": "Thing", "name": value},
        "isPartOf": site_ld(base, locale), "license": CC0,
    }
    if post["edited_by"]:
        article["editor"] = {"@type": "Person", "name": post["edited_by"]}
    if img:
        article["image"] = img
    if tags:
        article["keywords"] = list(tags)
    if post["lang"]:
        # a free-form endonym, not a code -- Language takes a name, and this is
        # the name the wiki actually stored
        article["inLanguage"] = {"@type": "Language", "name": post["lang"]}
    return write_head(
        page, title=title, desc=desc, canonical=url, locale=locale,
        og=og_tags(title, desc, url, "article", base=base, image=img,
                   locale=locale)
           + [("article:published_time", post["created_at"]),
              ("article:modified_time", post["updated_at"])],
        ld=[article, crumbs(base, [(value, base + value_path(post["format"],
                                                              post["value"])),
                                   (post["title"], url)])],
    )


def _index(con, request, path: str, base: str) -> HTMLResponse:
    with open(os.path.join(DIST, "index.html"), encoding="utf-8") as fh:
        page = fh.read()
    locale = request_ui_locale(request)

    def answer(body, content_locale=locale):
        res = HTMLResponse(body)
        # The number in a title varies by explicit UI preference first and
        # Accept-Language second. A cache must not hand the German spelling to
        # a French request (or the reverse).
        res.headers["Vary"] = "Accept-Language, Cookie"
        res.headers["Content-Language"] = content_locale
        return res

    if path == "":
        return answer(head_home(page, base, locale))
    if path == "guide":
        return answer(head_guide(page, base, locale))
    value = path_seg(request, "n/")
    if value is not None:
        return answer(head_number(con, page, value, base, locale))
    abbr = path_seg(request, "a/")
    if abbr is not None:
        return answer(head_abbr(con, page, abbr, base, locale))
    tag = path_seg(request, "t/")
    if tag is not None:
        return answer(head_tag(con, page, tag, base, locale))
    hit = re.fullmatch(r"p/(\d+)", path)
    if hit:
        row = con.execute("SELECT * FROM posts WHERE id = ? AND status = ?",
                          (hit.group(1), LIVE)).fetchone()
        if row:
            tags = [r["tag"] for r in con.execute(
                "SELECT tag FROM post_tags WHERE post_id = ? ORDER BY tag",
                (hit.group(1),))]
            return answer(og_head(page, dict(row), base, tags, locale))
    # Everything else: /search, /random, /new, /p/{id}/edit, an entry an
    # operator took down, and every mistyped path -- which answers 200 with the
    # app's "Nothing here" and would otherwise be indexed as a copy of the
    # front page. None of them is a page to keep: three are controls, one is a
    # form, and the rest do not exist.
    #
    # One default rather than a list of the routes, deliberately. A list would
    # be a second copy of App.tsx's <Routes> living over here, and a route
    # added there would arrive claiming to be indexable until somebody
    # remembered this file. Being indexable is the thing that has to be spelled
    # out; not being indexable is the safe answer to give a stranger.
    return answer(write_head(page, robots="noindex, follow", locale=locale))


@app.get("/robots.txt", response_class=PlainTextResponse)
def robots(request: Request):
    """What a crawler may have here, which is nearly everything.

    No per-bot group, and GPTBot, ClaudeBot and PerplexityBot are as welcome as
    Googlebot on purpose: everything readers write here is CC0, and the footer
    already invites anyone to "take it, quote it, feed it to a machine".
    Blocking the machines would contradict the licence the site states on every
    page. If that is ever to change, it changes here and in the footer together.

    Disallow is only for the two paths with nothing on them to index. The pages
    that should stay out of a result -- /search, /new, /random, an edit form --
    carry a robots meta instead, because a path disallowed here can never be
    crawled to *find* that meta, and an old link to one would sit in an index
    as a bare URL for good.
    """
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /admin\n"
        "Disallow: /api/\n"
        f"\nSitemap: {site_base(request)}sitemap.xml\n"
    )


@app.get("/sitemap.xml")
def sitemap(request: Request, con=Depends(get_db)):
    """Every page on this wiki worth indexing, in one file.

    The thirteenth public read, and it carries LIVE like the other twelve: an
    entry an operator hid keeps its row, and handing that row to a crawler in a
    list leaks exactly what hiding it was for.

    It is also the only way in. Every link to /n/42 and /t/book is a <Link> the
    router draws after the JavaScript has run, and most crawlers -- every AI
    one -- do not run it. Without this file the wiki is one page deep no matter
    how much is written in it.

    ponytail: one pass, no pagination. A sitemap holds 50,000 URLs, this wiki
    has a few hundred, and past that ceiling this becomes a sitemap index over
    /sitemap-posts.xml and friends.
    """
    base = site_base(request)
    urls = [(base, None), (f"{base}guide", None)]
    urls += [(f"{base}p/{r['id']}", r["updated_at"]) for r in con.execute(
        "SELECT id, updated_at FROM posts WHERE status = ? ORDER BY id", (LIVE,))]
    # grouped by section as well as by value, because the two are two pages:
    # UFO filed as an abbreviation is /a/UFO and UFO filed as Mixed is /n/UFO,
    # and value_path() is the one place that decides which.
    urls += [(base + value_path(r["fmt"], r["value"]), r["at"])
             for r in con.execute(
        "SELECT value, MAX(updated_at) AS at, "
        f"       CASE WHEN {section_where('abbr')} THEN 'ABBR' ELSE '' END AS fmt "
        "FROM posts WHERE status = ? GROUP BY value, fmt ORDER BY value, fmt",
        (LIVE,))]
    urls += [(f"{base}t/{enc(r['tag'])}", r["at"]) for r in con.execute(
        "SELECT t.tag, MAX(p.updated_at) AS at FROM post_tags t "
        "JOIN posts p ON p.id = t.post_id AND p.status = ? "
        "GROUP BY t.tag ORDER BY t.tag", (LIVE,))]
    body = "\n".join(
        f"  <url><loc>{xml_escape(loc)}</loc>"
        + (f"<lastmod>{at}</lastmod>" if at else "")
        + "</url>"
        for loc, at in urls
    )
    return Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n</urlset>\n",
        media_type="application/xml",
    )


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
    res = _index(con, request, path, site_base(request))
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
