"""Operator commands.  python admin.py <command> <id> [--yes]

    status <id>          what the wiki is showing for this entry
    hide <id>            take it off the public wiki
    show <id>            put it back
    purge <id> --yes     the one hard delete there is -- see below

Hiding is what moderation means here. The row stays, every public read skips it,
and `show` brings the entry back whole: its history, its translations, the talk
beside it. No API route removes a row, so nothing an operator does through the
back office is unrecoverable.

`purge` is the exception, and it is a shell command rather than a route because
whoever holds shell access *is* the operator and there is nobody to rate-limit.
It is for the removal a law requires -- a phone number, an address, a face. An
edit cannot do that job: snapshot() copies the old body into `revisions` and
/api/posts/{id}/revisions serves it to anyone, so blanking a field only moves
the data one click away. A purge takes the entry, its snapshots and its picture
together, and the ON DELETE CASCADE on post_tags, post_links, translations and
comments is what earns its keep here.

This file also holds the operator accounts once they exist; the commands above
need no login because the shell already is one.
"""
import os
import sys

import db
import gc_uploads
from main import UPLOAD_DIR

STATUSES = ("ACTIVE", "HIDDEN", "DELETED")


def status_of(post_id):
    con = db.connect()
    try:
        row = con.execute("SELECT status, title FROM posts WHERE id = ?",
                          (post_id,)).fetchone()
    finally:
        con.close()
    if row is None:
        raise LookupError(f"no entry {post_id}")
    return row["status"], row["title"]


def set_status(post_id, status):
    """Move an entry on or off the public wiki. Reversible by definition: the
    only thing that changes is a string in one column."""
    if status not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}")
    con = db.connect()
    try:
        with con:
            cur = con.execute("UPDATE posts SET status = ? WHERE id = ?",
                              (status, post_id))
    finally:
        con.close()
    if not cur.rowcount:
        raise LookupError(f"no entry {post_id}")
    return status


def purge(post_id):
    """Remove an entry, its history and its picture. Not reversible.

    Returns the picture filename if one was removed, else None.
    """
    con = db.connect()
    try:
        row = con.execute("SELECT image FROM posts WHERE id = ?", (post_id,)).fetchone()
        if row is None:
            raise LookupError(f"no entry {post_id}")
        with con:
            # The snapshots go first and by hand. No foreign key holds them --
            # which is exactly what lets them survive a hide, and exactly why a
            # bare DELETE FROM posts leaves behind the body a purge was for.
            con.execute("DELETE FROM revisions WHERE post_id = ?", (post_id,))
            con.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        # The picture goes only once nothing names it any more: a body can carry
        # the same path in markdown, and so can another entry's snapshot.
        # referenced() is asked *after* the delete, so it answers about what is
        # left. Same rule gc_uploads.py works by, and the same function.
        name = os.path.basename(row["image"] or "")
        if name and name not in gc_uploads.referenced(con):
            path = os.path.join(UPLOAD_DIR, name)
            if os.path.isfile(path):
                os.remove(path)
                return name
    finally:
        con.close()
    return None


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2 or not args[1].isdigit():
        raise SystemExit(__doc__)
    cmd, pid = args[0], int(args[1])
    try:
        if cmd == "status":
            state, title = status_of(pid)
            print(f"{pid} {state} -- {title}")
        elif cmd in ("hide", "show"):
            state = set_status(pid, "HIDDEN" if cmd == "hide" else "ACTIVE")
            print(f"{pid} is now {state}")
        elif cmd == "purge":
            # --yes for the same reason gc_uploads.py wants --delete: this is
            # the one command in the repo a typo cannot be taken back from.
            if "--yes" not in args:
                state, title = status_of(pid)
                raise SystemExit(
                    f"{pid} {state} -- {title}\nthis is permanent: the entry, its "
                    f"history and its picture.\npass --yes to go ahead."
                )
            gone = purge(pid)
            print(f"purged {pid}" + (f", removed {gone}" if gone else ""))
        else:
            raise SystemExit(__doc__)
    except LookupError as e:
        raise SystemExit(str(e))
