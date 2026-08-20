"""Delete uploads nothing points at.  python gc_uploads.py [--delete]

A picture is uploaded the moment one is picked, before the entry is saved, so the
commonest orphan is not a deleted entry -- it is a form somebody closed. Nothing
in the request path can tell that apart from a picture about to be used, which is
why this is a cron job with a grace period rather than a hook on a delete.

Hooking one would be wrong for a second reason: restore_revision hands
back the image path the entry had, so a file no live entry shows may still be the
one a restore needs. That is also why the snapshots count as references below.
"""
import os
import re
import sys
import time

import db
from main import UPLOAD_DIR  # imported, not recomputed: one definition of where

# Long enough for any form session. A picture younger than this may be sitting in
# a tab nobody has saved yet, and there is nobody to ask -- no accounts, no
# sessions, so age is the only signal there is.
GRACE = 24 * 3600

NAME_RX = re.compile(r"/uploads/([A-Za-z0-9._-]+)")


def referenced(con):
    """Every uploaded name the database still points at.

    Four places, not just posts.image: a body can carry ![](/uploads/x.png), a
    translation's body can too, and a revision snapshot is an entry in full --
    which is exactly what lets a restore hand an old path back. Snapshots are
    scanned as text rather than parsed, so a name sitting in any field of any
    shape the snapshot format has ever had still counts.
    """
    names = set()
    for sql in (
        "SELECT image FROM posts WHERE image IS NOT NULL",
        "SELECT body FROM posts",
        "SELECT body FROM translations",
        "SELECT snapshot FROM revisions",
    ):
        for (text,) in con.execute(sql):
            names.update(NAME_RX.findall(text or ""))
    return names


def sweep(delete=False):
    """Report the files nothing points at and that are old enough to go."""
    con = db.connect()
    try:
        keep = referenced(con)
    finally:
        con.close()
    cutoff = time.time() - GRACE
    kept = freed = 0
    orphans = []
    for f in sorted(os.scandir(UPLOAD_DIR), key=lambda f: f.name):
        if not f.is_file():
            continue
        if f.name in keep or f.stat().st_mtime > cutoff:
            kept += 1
            continue
        orphans.append(f.name)
        freed += f.stat().st_size
        if delete:
            os.remove(f.path)
    for name in orphans:
        print(("removed " if delete else "orphan  ") + name)
    print(f"{kept} in use or too new, {len(orphans)} orphaned ({freed / 1e6:.1f} MB)"
          + ("" if delete else " -- pass --delete to remove them"))
    return orphans


if __name__ == "__main__":
    sweep("--delete" in sys.argv)
