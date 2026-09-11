"""Namba API -- an open, no-login wiki of numbers."""
import json
import os
import re
import time
import traceback
from collections import defaultdict
from typing import ClassVar, List, Optional
from uuid import uuid4
from xml.sax.saxutils import escape as xml_escape

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse, JSONResponse, PlainTextResponse, Response,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

import admin_api
import db
import events
import seo
from db import UPLOAD_DIR, get_db, nfc, now, writing
from store import (
    LIVE, Text, apply_snapshot, fetch_one, guard_public, resolve_format,
    section_sql, section_where, shape, snapshot, ungroup, write_tags,
)
from numfmt import FORMATS, bucket_of

# A tag is whatever people call it, like a translation's language label. What
# is checked is its shape, not its membership of a list -- the wiki's working
# vocabulary is the set of tags actually in use, which /api/tags reports.
TAG_MAX = 24
# Two. A film of a book gets both, and that is already the widest an entry
# honestly is -- five was room to file one number under half the wiki.
TAGS_PER_POST = 2

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
# What an entry's `image` may point at: one of this wiki's own uploads. The
# page draws the column straight into an <img>, so an outside URL is a
# tracking pixel every reader fetches -- the reader's side of the argument that
# keeps link unfurling out -- and og_head would build an og:image from it that
# points nowhere. Same name shape gc_uploads.NAME_RX scans for, same extensions
# /api/upload accepts, so the three cannot disagree about what a picture is.
UPLOAD_PATH = re.compile(
    r"^/uploads/[A-Za-z0-9._-]+\.(?:%s)$"
    % "|".join(sorted(re.escape(e[1:]) for e in ALLOWED_EXT)))
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

# For the built bundle only -- see the asset branch of spa() for why the prefix
# is the condition and not the directory.
ASSET_CACHE = {"Cache-Control": "public, max-age=31536000, immutable"}

db.init()

app = FastAPI(title="Namba")
# Readable from any origin, writable from this one. A JSON write from another
# site preflights, and this answers a preflight for anything but a read with a
# 400 -- the first of the two layers `guard` describes. Credentials stay off:
# the admin cookie is SameSite=Strict, and the two together would undo both.
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
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


@app.exception_handler(Exception)
def _unhandled(request: Request, exc: Exception):
    """A 500 leaves a row in the log an operator already reads.

    Without it an unhandled exception goes to the container's stdout and
    nowhere an operator looks, and a route that fails only on some input -- a
    backslash in a title, say -- is found by the reader who types it rather
    than by the log. `events` is the log this repo already has, append-only,
    with a back office drawing it; the dashboard's activity list asks for
    `kind=all`, so an ERROR row appears there with no front-end change at all.

    **What goes in `meta` is the exception's type, the route's pattern and the
    file and line it came from -- and never the message or the path as typed.**
    The message can quote what a stranger wrote (a `re.error` quotes the
    pattern, and the pattern may be a title) and `meta` is in the one table
    `purge` cannot reach: content does not go somewhere a removal cannot
    follow it (ADR-0004). So this log answers *what is breaking and where*, and the
    stdout traceback -- unchanged, because Starlette re-raises after calling a
    handler -- answers *with what input*.

    The whole body is inside a try: the case where the database is what broke
    is precisely the case where this runs, and a handler that raises turns a
    500 into a stack trace with no response at all.
    """
    try:
        route = request.scope.get("route")
        frame = traceback.extract_tb(exc.__traceback__)[-1:]
        con = db.connect()
        try:
            with con:
                events.record(
                    con, "ERROR", client=events.client_of(request),
                    error=type(exc).__name__,
                    route=f"{request.method} {getattr(route, 'path', '?')}",
                    where=f"{os.path.basename(frame[0].filename)}:{frame[0].lineno}"
                          if frame else None,
                )
        finally:
            con.close()
    except Exception:
        pass
    return JSONResponse(
        {"detail": "something on this server broke -- it is in the operators' log "
                   "now, and nothing you sent was saved"},
        status_code=500,
    )
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
# When to throw away the addresses that have stopped writing. Only the
# timestamps inside a key expire on their own, so without this every IP hash
# that ever posted stays in the dict for the life of the process -- a slow leak
# on the one structure that is per-worker and never looked at again. Swept in bulk
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

    Counting is keyed on the hash rather than the address, so no raw IP sits
    in a process dict. Reads go through nothing: there is nothing to record
    about a page view, and reading this wiki is meant to cost nothing at all.

    A write from another site is refused first. Every count below is per
    address and assumes an attacker has few of them; a page elsewhere that
    writes here through its visitors' browsers has all of theirs, and a block
    aimed at it lands on the visitors. CORS closes the preflighted path (a JSON
    body). This closes the other one -- a body with no content type or a
    multipart form never preflights -- by reading `Sec-Fetch-Site`, which
    every current browser attaches and no other client does. curl sends
    nothing and is still welcome, which is what "open, no key" means.
    `same-site` passes: chiral.kr and namba.chiral.kr are one site.
    """
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(
            403, "This API is written to from its own pages, not from another "
                 "site's. Reading is open to everyone.")
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
def nick(typed):
    """The name a write is filed under.

    There are no accounts here, so this is a string somebody typed and nothing
    more -- but a blank one has to become a word, or a byline reads as a field
    that failed to load rather than as an anonymous contribution. Every write
    below asked the same question in the same breath, several of them twice in
    one function.
    """
    return typed.strip() or "anonymous"


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


class PostRules(Text):
    """The four checks a create and an edit answer identically.

    Only the field *types* differ between the two below -- a create requires a
    value and a title, an edit sends whichever fields it touched -- and the
    rules about what those characters may be are the same rules. They lived in
    both classes, byte for byte, which is two places to fix a rule that has one
    reason. `check_fields=False` because the fields themselves are declared by
    the subclasses; this class is never validated on its own.
    """

    # min_length counts characters and "   " has three of them, while the
    # writes below store `value.strip()` and `title.strip()`. Without this a
    # form submitted with spaces in both was a 201 holding an empty title under
    # an empty number -- a blank row on the index whose link is /n/, which
    # matches no route, on a wiki where nothing removes an entry. Checked here
    # rather than by stripping on the way in: a poster who typed only spaces
    # meant to type something, and a 422 says so. An edit sends `None` for a
    # field it is not touching, which is the `is not None` here.
    @field_validator("value", "title", check_fields=False)
    @classmethod
    def not_blank(cls, v):
        if v is not None and not v.strip():
            raise ValueError("must not be blank")
        return v

    @field_validator("lang", check_fields=False)
    @classmethod
    def blank_lang(cls, v):
        return (v.strip() or None) if v is not None else None

    # None only reaches here from PostPatch, where an absent list means "leave
    # the tags alone". PostIn's `List[str]` refuses a null before this runs.
    @field_validator("tags", check_fields=False)
    @classmethod
    def check_tags(cls, v):
        return v if v is None else _clean_tags(v)

    @field_validator("format", check_fields=False)
    @classmethod
    def known_format(cls, v):
        if v is not None and v not in FORMATS:
            raise ValueError(f"format must be one of {FORMATS}")
        return v

    # None passes: it is how the form removes a picture. A restore does not
    # come through here, since a snapshot has to be restorable whatever it holds.
    @field_validator("image", check_fields=False)
    @classmethod
    def own_upload(cls, v):
        if v is not None and not UPLOAD_PATH.match(v):
            raise ValueError("an image is one of this wiki's uploads: /uploads/<name>."
                             + "|".join(sorted(e[1:] for e in ALLOWED_EXT)))
        return v


class PostIn(PostRules):
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


class PostPatch(PostRules):
    # The entry as the sender last saw it -- MediaWiki calls this
    # `basetimestamp`. Optional, and that is the promise rather than the
    # omission: a write without one behaves as it always did, because this is an
    # open API with no key and forcing a read-then-write on `curl` would charge
    # everyone for a problem the edit form has. The form does have it, though,
    # and always sends this.
    base_updated_at: Optional[str] = Field(default=None, max_length=40)
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


class TranslationIn(Text):
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


class CommentIn(Text):
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


class FlagIn(Text):
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
    args = [nfc(lang)]
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
        args.append(nfc(tag).lower())
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

    # Which language to read the index in is the reader's, not this endpoint's.
    # One flat lookup rather than a join per row; the whole table is small and
    # the join would need de-duplicating anyway.
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
    # the filters read the column, so they are folded the way the column is
    value, tag, q = nfc(value), nfc(tag), nfc(q)
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
        # This compare is what holds an abbreviation to one page: the stored
        # spellings may differ in case -- dB and DB -- and either link, in any
        # case, asks for all of them. A Mixed "gross" and "GROSS" stay two
        # values, which is why it belongs to the section and not to the column.
        loose = section == "abbr" or (format or "").upper() == "ABBR"
        where.append("p.value = ? COLLATE NOCASE" if loose else "p.value = ?")
        args.append(value)
    if format:
        where.append("p.format = ?")
        args.append(format.upper())
    # what tells /n/42 from /a/UFO from /c/12-25 -- see section_where()
    in_section = section_where(section, "p.")
    if in_section:
        where.append(in_section)
    if q:
        # Each word must be somewhere in the entry.  A literal phrase is too
        # strict for a search such as "moon landing": the useful entry may
        # say "landing on the moon". EXISTS rather than a join still ensures
        # a post with several translations comes back only once.
        for term in q.split():
            where.append(
                f"""(p.title LIKE ? ESCAPE '{db.LIKE_ESC}'
                     OR p.body LIKE ? ESCAPE '{db.LIKE_ESC}'
                     OR p.value LIKE ? ESCAPE '{db.LIKE_ESC}'
                     OR EXISTS (SELECT 1 FROM translations t
                                WHERE t.post_id = p.id
                                  AND (t.title LIKE ? ESCAPE '{db.LIKE_ESC}'
                                       OR t.body LIKE ? ESCAPE '{db.LIKE_ESC}')))"""
            )
            args += [db.like(term)] * 5
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
    if q and sort == "relevance":
        # Results that identify the value or name the whole phrase are the
        # best autocomplete choices. Body-only mentions remain discoverable,
        # but never crowd those direct matches out of a short suggestion list.
        order = f"""CASE
            WHEN p.value = ? COLLATE NOCASE THEN 0
            WHEN p.value LIKE ? ESCAPE '{db.LIKE_ESC}' THEN 1
            WHEN p.title LIKE ? ESCAPE '{db.LIKE_ESC}'
                 OR EXISTS (SELECT 1 FROM translations t
                            WHERE t.post_id = p.id
                              AND t.title LIKE ? ESCAPE '{db.LIKE_ESC}') THEN 2
            WHEN p.body LIKE ? ESCAPE '{db.LIKE_ESC}'
                 OR EXISTS (SELECT 1 FROM translations t
                            WHERE t.post_id = p.id
                              AND t.body LIKE ? ESCAPE '{db.LIKE_ESC}') THEN 3
            ELSE 4 END, p.id DESC"""
        args += [q, db.like(q), db.like(q), db.like(q), db.like(q), db.like(q)]
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
    """The newest REVISIONS_SHOWN versions of an entry, as labels.

    Four fields off each snapshot and then the snapshot is dropped, which is
    also what the back office's own revision list does. What this answers is a
    history someone is reading -- what the entry was called, which number it was
    filed under, who and when -- and a restore is a POST that reads the snapshot
    server-side, so a client never needed one. Shipping them whole meant the
    edit form opened by downloading fifty complete entries, bodies and
    translations and all, to draw fifty titles.

    Capped as well as trimmed, because nothing prunes the rows: an entry that
    has been fought over carries hundreds. Only the response is capped -- the
    rows stay, since they are the only thing standing between vandalism and
    permanent loss, and reverting vandalism means reaching for a recent one.

    `grouped` and `format` are here because the value reads through both:
    without the flag, 1000 renders as 1000 in a history whose entry shows
    1,000, and without the format a date reads as 12-25 under an entry whose
    hero says 25 December. Neither is a different number.
    """
    guard_public(con, post_id)
    # The four fields, asked for by name. SQLite reads them out of the stored
    # JSON, so an entry fought over five hundred times is not five hundred
    # whole entries parsed in Python to draw fifty labels. A key a snapshot
    # does not carry comes back NULL, which is what `.get()` answered.
    rows = con.execute(
        """SELECT id, author, at,
                  json_extract(snapshot, '$.title')   AS title,
                  json_extract(snapshot, '$.value')   AS value,
                  json_extract(snapshot, '$.format')  AS format,
                  json_extract(snapshot, '$.grouped') AS grouped
           FROM revisions WHERE post_id = ? ORDER BY id DESC LIMIT ?""",
        (post_id, REVISIONS_SHOWN),
    ).fetchall()
    return [dict(r, grouped=bool(r["grouped"])) for r in rows]


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
    author = nick(p.author)
    ts = now()
    with writing(con):
        # The one write that decides nothing about another row: `resolve_format`
        # is pure, an entry under a value that already has ten is normal, and
        # there is no uniqueness here to race for. So the lock is held for the
        # three statements below landing together, not for a read -- see
        # db.writing() and ADR-0007 for the eleven writes where it is the read.
        value, fmt, key = resolve_format(value, p.format)
        cur = con.execute(
            """INSERT INTO posts (value, format, sort_key, title, body, image, author,
                                  lang, grouped, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (value, fmt, key, p.title.strip(), p.body, p.image,
             author, p.lang, int(grouped), ts, ts),
        )
        write_tags(con, cur.lastrowid, p.tags)
        post_id = cur.lastrowid
        # A create has no prior state, so there is no snapshot to point at --
        # which is the whole reason the log is its own table and not a column on
        # revisions. Without this row a spammer's first twenty entries would be
        # invisible to the abuse view.
        events.record(con, "CREATE", client=who, who=author,
                      target_type="post", target_id=post_id, value=value)
    return fetch_one(con, post_id)


@app.patch("/api/posts/{post_id}")
def edit_post(post_id: int, p: PostPatch, who=Depends(guard), con=Depends(get_db)):
    # Which fields the caller actually sent. For image, null is a value -- it
    # is how the form removes one -- and defaulting it to None made "unchanged"
    # and "clear this" the same request, so Remove quietly did nothing.
    sent = p.model_dump(exclude_unset=True)
    # Input grammar and the sender's idea of what they are editing, neither of
    # which is entry content: they must not appear as changed fields in the
    # audit log or a revision diff.
    sent.pop("number_locale", None)
    sent.pop("base_updated_at", None)
    editor = nick(p.author)
    with writing(con):
        rev = snapshot(con, post_id, editor)
        # Read here and not before the block. The lock is held from the top of
        # it, so from this line to the commit no other writer can get in and
        # what this row says stays true. Read outside, it is a row from before
        # the lock -- and every column the UPDATE fills in from it is a column
        # an edit that arrived in between wrote, being handed back its old
        # value.
        current = fetch_one(con, post_id)
        # the same rule from the other side -- "Written in" is a menu of every
        # language, and one of them may already be a tab on this entry. Also in
        # here now, so the tab it checks for cannot appear between the check and
        # the write.
        if "lang" in sent and says_it_twice(
                p.lang, [t["lang"] for t in current["translations"]]):
            raise HTTPException(422, "the entry already has a version in that language")
        # the box has to be settled before the value is, since it decides
        # whether separators in what was typed are stripped or kept
        grouped = p.grouped if "grouped" in sent else bool(current["grouped"])
        value = current["value"]
        if p.value is not None:
            value, grouped = ungroup(p.value, grouped, p.number_locale)
        if p.format:
            value, fmt, key = resolve_format(value, p.format)
        elif p.value is not None:
            value, fmt, key = resolve_format(value, None)  # value changed, re-derive
        else:
            fmt, key = current["format"], current["sort_key"]
        # author is the first writer and stays put -- on an open wiki, an edit
        # by a stranger must not erase who the entry came from.
        # The conflict check is the last clause and nothing else: one statement,
        # so there is no read for another writer to slip past. A NULL base skips
        # it. rowcount is then 0 in exactly one case -- the entry moved on since
        # the sender read it -- because a row that is missing or hidden already
        # raised out of fetch_one above, and SQLite counts a row it matched even
        # when every value it wrote was the same.
        done = con.execute(
            """UPDATE posts SET value=?, format=?, sort_key=?, title=?, body=?,
                                image=?, lang=?, grouped=?, edited_by=?,
                                updated_at=? WHERE id=?
                            AND (? IS NULL OR updated_at = ?)""",
            (
                value, fmt, key,
                p.title.strip() if p.title is not None else current["title"],
                p.body if p.body is not None else current["body"],
                p.image if "image" in sent else current["image"],
                p.lang if "lang" in sent else current["lang"],
                int(grouped),
                editor,
                now(), post_id,
                p.base_updated_at, p.base_updated_at,
            ),
        )
        if not done.rowcount:
            # Inside the block, which is what rolls the snapshot back: a refused
            # edit must not leave a revision saying somebody replaced the entry.
            raise HTTPException(
                409, "somebody else edited this entry since you opened it -- "
                     "reload the page and apply your change again")
        if p.tags is not None:
            write_tags(con, post_id, p.tags)
        # which fields were sent, not which actually changed: the diff between
        # the snapshot and the row is where "changed" is answered, and there is
        # no point storing a worse copy of it here
        events.record(con, "EDIT", client=who, who=editor,
                      target_type="post", target_id=post_id, revision_id=rev,
                      fields=sorted(sent))
    return fetch_one(con, post_id)


class RestoreIn(Text):
    author: str = Field(default="anonymous", max_length=40)


@app.post("/api/posts/{post_id}/revisions/{rev_id}/restore")
def restore_revision(
    post_id: int,
    rev_id: int,
    body: RestoreIn = RestoreIn(),
    who=Depends(guard),
    con=Depends(get_db),
):
    author = nick(body.author)
    with writing(con):
        # All three deciding reads inside the lock. `alive` is the one that has
        # to be: it chooses between UPDATE and INSERT, and read outside it could
        # answer about a row that `admin.py purge` removed a moment later --
        # then the UPDATE matches nothing, the event says a restore happened and
        # the entry is still gone.
        guard_public(con, post_id)
        row = con.execute(
            "SELECT snapshot FROM revisions WHERE id = ? AND post_id = ?",
            (rev_id, post_id),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "revision not found")
        old = json.loads(row["snapshot"])
        alive = con.execute("SELECT 1 FROM posts WHERE id = ?", (post_id,)).fetchone()
        rev = None
        if alive:
            rev = snapshot(con, post_id, author)  # restoring is itself undoable
        else:
            # The post's row is gone. Nothing in this codebase removes a row, so
            # only a snapshot older than that rule can reach here (ADR-0002).
            # Snapshots outliving the post is the entire point of the revisions
            # table, so restore has to be able to put one back -- under its
            # original id, or every revision row and inbound link would be
            # pointing at nothing. There is nothing to snapshot first: the
            # delete already took one. It comes back ACTIVE, by the column's
            # default.
            #
            # **What cannot come back is what was never in the snapshot.**
            # `fetch_one` shapes a post with its tags and its translations, and
            # those are rebuilt below. Comments and links are not in there --
            # deliberately, since a comment is not part of the entry -- and both
            # tables cascade on `posts(id)`, so the delete took them and this
            # cannot give them back. A resurrected entry is the entry, its tags
            # and its translations, and no talk and no links.
            #
            # This branch answers for rows no code here can produce. Whether
            # production holds any is one query, and ADR-0002 carries it beside
            # the decision that keeps this branch, `guard_public`'s
            # absent-passes rule and PostPage's recovery view until it is run.
            # Only what apply_snapshot cannot write: the id it comes back
            # under, the first writer, the likes it had and the day it was
            # created. Every other column is the snapshot, filled in below.
            con.execute(
                """INSERT INTO posts (id, value, format, title, author, likes,
                                      created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (post_id, old["value"], old["format"], old["title"], old["author"],
                 old.get("likes", 0), old["created_at"], now()),
            )
        apply_snapshot(con, post_id, old, author)
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
    who = nick(t.author)
    ts = now()
    with writing(con):
        post = fetch_one(con, post_id)  # 404 if the post is gone
        # Before the snapshot, so a request that changes nothing leaves no
        # revision saying somebody replaced the entry -- and inside the lock,
        # which is what `edit_post` does with the same check. Outside it, an
        # edit setting `posts.lang` to this language commits in between and the
        # entry ends up written twice in one language, which is the one thing
        # this rule exists to stop.
        if says_it_twice(t.lang, [post["lang"]]):
            raise HTTPException(422, "the entry is already written in that language")
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
    editor = nick(nfc(author))
    with writing(con):
        # No fetch_one of its own: snapshot() reads through it, so a missing or
        # hidden entry is a 404 from in here.
        rev = snapshot(con, post_id, editor)
        cur = con.execute(
            "DELETE FROM translations WHERE id = ? AND post_id = ?", (tr_id, post_id)
        )
        # Inside the block, not after it. Raising out here is what rolls the
        # snapshot back: thrown once `with con` has committed, a 404 for a
        # translation that was never there leaves a revision behind saying
        # somebody replaced the entry. Nothing happened, and the rows that
        # stand between vandalism and permanent
        # loss are the wrong table to leave noise in -- REVISIONS_SHOWN is 50,
        # and every phantom pushes a real version out of the window the edit
        # form offers.
        if not cur.rowcount:
            raise HTTPException(404, "translation not found")
        events.record(con, "UNTRANSLATE", client=who, who=editor,
                      target_type="post", target_id=post_id, revision_id=rev,
                      translation=tr_id)
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
    with writing(con):
        fetch_one(con, post_id)  # before the counter moves, not after
        con.execute("UPDATE posts SET likes = likes + 1 WHERE id = ?", (post_id,))
    return {"likes": fetch_one(con, post_id)["likes"]}


@app.delete("/api/posts/{post_id}/like")
def unlike(post_id: int, _=Depends(guard), con=Depends(get_db)):
    with writing(con):
        fetch_one(con, post_id)
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
    author = nick(c.author)
    with writing(con):
        # Inside, because `comments` has a foreign key on `post_id`: read
        # outside and a purge in between turns this into an integrity error and
        # a 500, where the answer the caller should get is the 404 this raises.
        fetch_one(con, post_id)
        con.execute(
            "INSERT INTO comments (post_id, author, body, created_at) VALUES (?,?,?,?)",
            (post_id, author, c.body, now()),
        )
        # no revision_id: a comment takes no snapshot, which is the same reason
        # it is not on fetch_one
        events.record(con, "COMMENT", client=who, who=author,
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
    asked_by = nick(r.author)
    with writing(con):
        fetch_one(con, post_id)  # 404 on a missing or already hidden entry
        # `_already_open` is the deciding read here, and the reason it cannot be
        # a UNIQUE index is in its own docstring. Inside the lock it is the
        # constraint it stands in for; outside it, two requests sent together
        # both find nothing pending and both land, which is the count of
        # *people* it exists to keep honest.
        if _already_open(con, "delete_requests", post_id, who, "PENDING"):
            raise HTTPException(409, "you have already asked about this entry")
        cur = con.execute(
            """INSERT INTO delete_requests
                   (post_id, reason, detail, requested_by, ip_hash, ua_hash,
                    client_hash, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (post_id, r.reason, r.detail.strip(), asked_by,
             who["ip_hash"], who["ua_hash"], who["client_hash"], now()),
        )
        events.record(con, "DELETE_REQUEST", client=who, who=asked_by,
                      target_type="request", target_id=cur.lastrowid,
                      post=post_id, reason=r.reason)
    return {"id": cur.lastrowid, "status": "PENDING"}


@app.post("/api/posts/{post_id}/report", status_code=201)
def report(post_id: int, r: ReportIn, who=Depends(guard), con=Depends(get_db)):
    """Say something is wrong with an entry without asking for it to go.

    Answers with the entry's open count, which is what the page can show back --
    and deliberately not with the reports themselves. They are addressed to the
    operator, and a public list of them is a second place to write abuse.
    """
    with writing(con):
        fetch_one(con, post_id)
        if _already_open(con, "reports", post_id, who, "OPEN"):
            raise HTTPException(409, "you have already reported this entry")
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
    a, b = sorted((post_id, link.other_id))
    with writing(con):
        # Both, inside: `post_links` has a foreign key on each end, and OR
        # IGNORE would swallow a violation as silently as it swallows the
        # duplicate it is there for.
        fetch_one(con, post_id)
        fetch_one(con, link.other_id)
        cur = con.execute(
            "INSERT OR IGNORE INTO post_links (a_id, b_id) VALUES (?,?)", (a, b))
        # Only if something was actually linked -- the same guard `remove_link`
        # below carries, and its comment named the asymmetry from the other
        # side. OR IGNORE means pressing Link on a pair that is already linked
        # is a no-op, and every one of those was a row in an append-only log
        # counting towards the client's writes in /api/admin/abuse, which is
        # the number a block gets decided on.
        if cur.rowcount:
            events.record(con, "LINK", client=who, target_type="post",
                          target_id=post_id, other=link.other_id)
    return get_post(post_id, con)


@app.delete("/api/posts/{post_id}/links/{other_id}")
def remove_link(post_id: int, other_id: int, who=Depends(guard), con=Depends(get_db)):
    a, b = sorted((post_id, other_id))
    with writing(con):
        fetch_one(con, post_id)
        cur = con.execute("DELETE FROM post_links WHERE a_id = ? AND b_id = ?", (a, b))
        # Only if something was actually unlinked. `events` is append-only by
        # design, so a row for a link that was never there cannot be tidied up
        # later -- and it counts towards the client's writes in /api/admin/abuse,
        # which is the number a block gets decided on.
        if cur.rowcount:
            events.record(con, "UNLINK", client=who, target_type="post",
                          target_id=post_id, other=other_id)
    return get_post(post_id, con)


@app.post("/api/upload")
def upload(file: UploadFile = File(...), who=Depends(guard), con=Depends(get_db)):
    """A picture, before the entry that will show it.

    A plain `def`, so Starlette runs it in the threadpool. Every part of this
    is blocking -- the directory is stat'd, up to 5 MB is written, a
    transaction is opened -- and in an `async def` all three would run *on*
    the event loop with every other request waiting behind them. On this wiki
    that is every page load, since /p/42 reads the database for its own
    <head>. `file.file` is the underlying blocking handle, which is what a
    sync route reads from.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"allowed types: {', '.join(sorted(ALLOWED_EXT))}")
    data = file.file.read(MAX_UPLOAD + 1)
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
    # grouped by section as well as by value, because each section is its own
    # page: UFO filed as an abbreviation is /a/UFO and UFO filed as Mixed is
    # /n/UFO, 12-25 as a date is /c/12-25 and as Mixed is /n/12-25, and
    # value_path() is the one place that decides which.
    #
    # NOCASE, and the spelling off the earliest row, because a <loc> has to be
    # the canonical: `dB` and `DB` are two spellings of one abbreviation, /a/
    # reads them as one list, and head_abbr() canonicalises that list to the
    # first entry's spelling. Grouped case-sensitively this file would offer a
    # crawler two URLs for the one page, each pointing the other way. The join
    # is what picks the spelling -- MIN(id) beside MAX(updated_at) is two
    # aggregates, and SQLite only promises a bare column follows one of them.
    # Digits have no case, so folding the number section too changes nothing.
    urls += [(base + seo.value_path(r["section"], r["value"]), r["at"])
             for r in con.execute(
        f"SELECT p.value, g.at, {section_sql('p.')} AS section "
        "FROM posts p JOIN ("
        "    SELECT MIN(id) AS id, MAX(updated_at) AS at FROM posts WHERE status = ? "
        f"    GROUP BY value COLLATE NOCASE, {section_sql()}"
        ") g ON g.id = p.id ORDER BY p.value, section",
        (LIVE,))]
    urls += [(f"{base}t/{seo.enc(r['tag'])}", r["at"]) for r in con.execute(
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
        back_office = os.path.join(DIST, "admin.html")
        if not os.path.isfile(back_office):
            raise HTTPException(404, "back office not built; run npm run build")
        return FileResponse(back_office)
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
            # Vite writes the content hash into the name -- main-Dbx1uZXh.js --
            # so a URL under /assets/ can only ever answer with these bytes and
            # a new build is a new URL, which is the whole condition a year of
            # `immutable` needs. On the prefix rather than on the branch,
            # because nothing else in dist/ is hashed: index.html, og.png and
            # the favicon keep their names across deploys, and a year on those
            # is a stale app nobody can reload their way out of. Without this
            # the returning visitor still asks about every file it already
            # has and collects a 304 for each.
            return FileResponse(target, headers=ASSET_CACHE
                                if path.startswith("assets/") else None)
    # This file owns where the built document is; seo.py owns what head goes
    # into it, which is why it is read here and passed in rather than opened
    # over there.
    with open(os.path.join(DIST, "index.html"), encoding="utf-8") as fh:
        page = fh.read()
    res = seo.index_html(con, request, path, page, site_base(request))
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
