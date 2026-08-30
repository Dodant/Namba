"""Reading and writing one entry: the pieces both APIs need.

Here rather than in main.py because `admin_api.py` needs them too and may not
import main -- main imports it, to include the router. Everything in this file
is about a `posts` row and the four tables hanging off it; the routes, the
models and the number parsing stay where they were.
"""
import json

from fastapi import HTTPException

from db import now
from numfmt import bucket_of

# The only status a visitor ever sees. Twelve reads in main.py carry it -- the
# index, the two list endpoints, one entry, the two vocabularies, an entry's
# related row, its history and its comments, the three <head>s written for
# /p/{id}, /n/{value} and /t/{tag}, and the sitemap -- and missing one leaks the
# body of something an operator took down. test_hidden_is_invisible walks all
# twelve. It was nine until the crawler's half of the site arrived: a head that
# names an entry and a sitemap that links to it are both places a row can leak
# to somebody who never called the API at all. The writes need no equivalent: they
# reach for fetch_one() below first and get the 404 from there.
LIVE = "ACTIVE"


def shape(rows, con):
    """Rows -> dicts with tags attached (one query for the whole page)."""
    posts = [dict(r) for r in rows]
    if not posts:
        return posts
    ids = [p["id"] for p in posts]
    by_id = {p["id"]: p for p in posts}
    for p in posts:
        p["tags"] = []
        p["bucket"] = bucket_of(p["sort_key"], p["format"])
        # sqlite has no bool; the wire and the client both want one
        p["grouped"] = bool(p["grouped"])
    q = "SELECT post_id, tag FROM post_tags WHERE post_id IN (%s) ORDER BY tag" % (
        ",".join("?" * len(ids))
    )
    for r in con.execute(q, ids):
        by_id[r["post_id"]]["tags"].append(r["tag"])
    return posts


def guard_public(con, post_id):
    """404 unless this entry is on the wiki, for the reads that are keyed on a
    post id rather than joined to one.

    A row that is simply *absent* passes. Entries removed by the DELETE route
    that used to exist have no row at all, and their snapshots are the only
    copy left of them -- so the recovery path has to stay open to those, while a
    hidden entry's history stays shut. Nothing can reach that state any more:
    no route removes a row.
    """
    row = con.execute("SELECT status FROM posts WHERE id = ?", (post_id,)).fetchone()
    if row is not None and row["status"] != LIVE:
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
        (post_id, json.dumps(post, ensure_ascii=False), author, now()),
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
        t = " ".join(str(t).split()).lower()
        if t and t not in clean:
            clean.append(t)
    con.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    con.executemany(
        "INSERT INTO post_tags (post_id, tag) VALUES (?,?)",
        [(post_id, t) for t in clean],
    )


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
