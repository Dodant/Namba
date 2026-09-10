"""Reading and writing one entry: the pieces both APIs need.

Here rather than in main.py because `admin_api.py` needs them too and may not
import main -- main imports it, to include the router. Everything in this file
is about a `posts` row and the four tables hanging off it; the routes and the
models stay where they were.

`ungroup` and `resolve_format` are here for that same reason and no other:
three writes settle a value -- create, edit and the operator's renumber -- and
the third is in a module that may not import `main`. How a value is spelled and
which format it is filed under has to be answered identically by all three.
"""
import json

from fastapi import HTTPException
from pydantic import BaseModel, field_validator

from db import nfc, now
from numfmt import bucket_of, canonical_value, is_abbr, parse_number


class Text(BaseModel):
    """The base every request model on both APIs inherits.

    One rule: text arrives in the normal form the database stores (db.nfc).
    Before validation, so a length cap counts the composed string and a
    vocabulary check sees the spelling the column holds. Lists of strings --
    tags -- are folded element by element; nothing else is touched.
    """

    @field_validator("*", mode="before")
    @classmethod
    def one_normal_form(cls, v):
        return nfc(v)

# The only status a visitor ever sees. Thirteen reads in main.py carry it -- the
# index, the list endpoint the feed and the search share, one entry, the two
# vocabularies, an entry's related row, its history and its comments, the four
# <head>s written for /p/{id}, /n/{value}, /a/{value} and /t/{tag}, and the
# sitemap -- and missing one leaks the body of something an operator took down.
# test_hidden_is_invisible walks all thirteen: eight API reads, four heads and
# the sitemap. A head that names an entry and a sitemap that links
# to it are both places a row can leak to somebody who never called the API at
# all. The writes need no equivalent: they reach for fetch_one() below first and
# get the 404 from there.
LIVE = "ACTIVE"


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


def resolve_format(value, given):
    """(value as stored, format, sort_key). The parsed suggestion, unless the
    poster explicitly picked a format.

    It hands the value back because settling the format is what settles how the
    value is spelled: `ungroup` takes a separator out because `posts.grouped`
    puts it back, and an ABBR keeps its case because nothing else does. Case is
    part of an abbreviation's spelling and not a way of typing it -- `dB` is
    not `DB`, `kB` is not `KB`, `mAh` is not `MAH` -- so it is stored as typed,
    the same as every other format. Nobody here can be asked which was meant:
    a decibel and a database are two words that share three letters, and with
    no accounts the writer is gone by the time anyone notices.

    One word is still one page, which is the part that does not need a stored
    spelling to hold. The `/a/` reads compare `COLLATE NOCASE`, so /a/ufo,
    /a/Ufo and /a/UFO are one list; `head_abbr` writes one canonical for it,
    the earliest entry's spelling; and the sitemap groups the same way, so the
    <loc> and the canonical agree. Three mechanisms, none of them a rewrite of
    what somebody typed (ADR-0005).

    It is also where ABBR is checked rather than taken at its word. Every other
    format is a way of reading what was typed and cannot be wrong about it; this
    one is a claim about the value, and with no login the claim is a stranger's.
    All three writes settle the format here -- create with what was typed, edit
    with what is stored, since the wiki's form keeps the number read-only once
    the entry exists, and an operator's renumber with what they retyped -- so
    this is the one place that catches every one of them.

    Pure, and that is load-bearing: no sibling lookup means a create decides
    nothing about another row, which is why it is the one write with no
    deciding read to hold the lock over (ADR-0007).
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


def shape(rows, con):
    """Rows -> dicts with tags attached (one query for the whole page)."""
    posts = [dict(r) for r in rows]
    if not posts:
        return posts
    ids = [p["id"] for p in posts]
    by_id = {p["id"]: p for p in posts}
    for p in posts:
        p["tags"] = []
        p["bucket"] = bucket_of(p["sort_key"], p["format"], p["value"])
        # sqlite has no bool; the wire and the client both want one
        p["grouped"] = bool(p["grouped"])
    q = "SELECT post_id, tag FROM post_tags WHERE post_id IN (%s) ORDER BY tag" % (
        ",".join("?" * len(ids))
    )
    for r in con.execute(q, ids):
        by_id[r["post_id"]]["tags"].append(r["tag"])
    return posts


def guard_public(con, post_id):
    """404 unless this entry is on the wiki or is recoverable, for the reads
    keyed on a post id rather than joined to one.

    A 404 here means there is nothing at this id and nothing was; a 200 means
    there is something, or something that can be brought back. Three cases and
    the middle one is the reason this is not one condition:

    * the row is there and not `LIVE` -- an operator took it down, and its
      history is nobody's business until they put it back;
    * the row is absent and nothing is behind it -- an id nobody was ever
      given, which is a 404 and used to be an empty list, an answer that said
      the entry existed and had no history;
    * the row is absent and snapshots are behind it -- the one thing the
      recovery path is for. `/revisions` is where `PostPage` reads what it is
      offering to put back, so this has to pass or the offer cannot be drawn.

    Nothing in this codebase removes a row, so the third case takes somebody
    writing SQL at the file. ADR-0002 has the count against production, which
    is zero, and why the path is kept anyway.
    """
    row = con.execute("SELECT status FROM posts WHERE id = ?", (post_id,)).fetchone()
    if row is not None:
        if row["status"] != LIVE:
            raise HTTPException(404, "post not found")
        return
    # asked only on the absent path, which is a mistyped id and, once, an
    # entry somebody is trying to recover
    if not con.execute("SELECT 1 FROM revisions WHERE post_id = ? LIMIT 1",
                       (post_id,)).fetchone():
        raise HTTPException(404, "post not found")


def fetch_one(con, post_id, hidden=False):
    """One entry in full, or a 404.

    Hidden entries are 404s here, which is where most of the wiki gets that for
    free -- every write reaches through this function first. `hidden=True` is
    for the operator's own reads, the only ones that may see one.
    """
    sql = "SELECT * FROM posts WHERE id = ?"
    args = [post_id]
    if not hidden:
        sql += " AND status = ?"
        args.append(LIVE)
    row = con.execute(sql, args).fetchone()
    if row is None:
        raise HTTPException(404, "post not found")
    post = shape([row], con)[0]
    # Only the single-post view pays for these; the list endpoints stay lean.
    # snapshot() reads through here, so a translation lands in the edit history
    # with everything else and is no more losable than the post itself.
    post["translations"] = [
        dict(r)
        for r in con.execute(
            "SELECT * FROM translations WHERE post_id = ? ORDER BY id", (post_id,)
        )
    ]
    return post


# What a revision stores, named rather than taken from whatever `fetch_one`
# answers with. The two were one dict, and that made the single-post view's
# shape the storage format: a key added there landed in every snapshot from
# then on, in the one table nothing rewrites and no migration can reach --
# which is exactly the trap the note about comments warns of, held by the
# warning alone.
#
# Three columns are deliberately not here. `id` is `revisions.post_id`, which
# is the column that says which entry a snapshot is of. `status` is not
# content: hiding an entry takes no snapshot, and a restore must not put a
# hidden one back on the wiki. `bucket` is computed from the format and the
# sort key sitting beside it.
SNAPSHOT_FIELDS = ("value", "format", "sort_key", "title", "body", "image",
                   "lang", "grouped", "author", "edited_by", "likes",
                   "created_at", "updated_at")


def snapshot_of(post):
    """One entry as a revision keeps it: the fields above, its tags and its
    translations.

    Not every field is read back. `apply_snapshot` puts eleven of them on the
    row and the diff reads seven; `edited_by` and `updated_at` are stored
    because a snapshot is the entry *as it was*, and a version that cannot say
    who had last touched it is a worse record for the sake of two columns. The
    line to hold is that this list changes when somebody means it to.
    """
    return {
        **{field: post[field] for field in SNAPSHOT_FIELDS},
        "tags": post["tags"],
        "translations": post["translations"],
    }


def snapshot(con, post_id, author, hidden=False):
    """Store the current state of a post so an edit can be undone.

    Returns the new revision's id, which is what an event row carries so that
    "who did this" and "what it was before" are one join apart.

    `hidden` passes straight through to fetch_one, and it has to: an operator
    reverting vandalism has usually taken the entry down first, and reading it
    back through the public view 404s in the middle of their own restore.
    """
    post = fetch_one(con, post_id, hidden=hidden)
    cur = con.execute(
        "INSERT INTO revisions (post_id, snapshot, author, at) VALUES (?,?,?,?)",
        (post_id, json.dumps(snapshot_of(post), ensure_ascii=False), author, now()),
    )
    return cur.lastrowid


def write_tags(con, post_id, tags):
    """Folds case here too, because a snapshot may predate the rule.

    Restoring a revision written while tags were upper-cased must not put BOOK
    back beside book. Normalising without validating, deliberately: a restore
    has to work on whatever the past wrote, and refusing one because an old
    tag breaks a rule invented since would make history unreachable.
    """
    clean = []
    for t in tags:
        t = " ".join(nfc(str(t)).split()).lower()
        if t and t not in clean:
            clean.append(t)
    con.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    con.executemany(
        "INSERT INTO post_tags (post_id, tag) VALUES (?,?)",
        [(post_id, t) for t in clean],
    )


def apply_snapshot(con, post_id, old, editor):
    """Put a snapshot's fields back onto an entry, with its tags and its
    translations.

    Every restore is this: the wiki's own, the operator's, and the resurrect
    branch once it has put the row back. Three copies of one UPDATE is three
    places to remember when a column is added, and the column that gets
    forgotten is the one nobody notices a restore dropping.

    It reads what it needs by name and ignores the rest, which is what makes a
    snapshot written before `SNAPSHOT_FIELDS` existed -- carrying `id`,
    `status` and `bucket`, because it was `fetch_one`'s whole dict -- restore
    exactly as it always did.

    `author` is not in it, deliberately. The first writer is never
    overwritten, so a restore credits whoever pressed it in `edited_by` --
    which is what `editor` is, and what makes an operator's restore read as
    theirs.
    """
    con.execute(
        """UPDATE posts SET value=?, format=?, sort_key=?, title=?, body=?,
                            image=?, lang=?, grouped=?, edited_by=?, updated_at=?
           WHERE id=?""",
        (old["value"], old["format"], old["sort_key"], old["title"], old["body"],
         old["image"], old.get("lang"), int(old.get("grouped") or 0), editor,
         now(), post_id),
    )
    write_tags(con, post_id, old.get("tags", []))
    # a snapshot from before translations existed has none, and restoring it
    # says so -- the ones dropped are in the snapshot the restore just took
    write_translations(con, post_id, old.get("translations", []))


def write_translations(con, post_id, rows):
    """Put a snapshot's translations back, ids and all, so links to them hold."""
    con.execute("DELETE FROM translations WHERE post_id = ?", (post_id,))
    con.executemany(
        """INSERT INTO translations (id, post_id, lang, title, body, author,
                                     edited_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [
            (r["id"], post_id, r["lang"], r["title"], r["body"], r["author"],
             r.get("edited_by"), r["created_at"], r["updated_at"])
            for r in rows
        ],
    )
