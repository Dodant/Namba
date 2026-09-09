"""Copy the database somewhere safe.  python backup.py [DEST] [--keep N]

A WAL database is two files while the wiki is running: the main file and a
`-wal` holding every write not yet checkpointed. `cp` of the main file is a
copy as of the last checkpoint, minus whatever came after, and it may not open
at all. This uses SQLite's online backup API, which copies pages under the
reader lock and hands back a single file that opens whole -- the one way to
take a copy while the wiki is up.

`secret.key` travels with it when it lives beside the database. It is the salt
under every hash in `events` and every block; a copy of the database without
it is a table of hashes that match nothing, and nothing complains. When the key
comes from `NAMBA_SECRET` instead, it is the environment's to keep, and this
says so rather than writing it to disk.

DEST defaults to `backups/` beside the database. That is the same disk, which
guards against vandalism and a corrupt file and not against the disk: point it
at another volume, or sync the directory off the box. The newest `--keep`
copies stay (14 by default); older ones are removed on each run.

Run from cron, beside gc_uploads.py. Never from a route.
"""
import argparse
import os
import shutil
import sqlite3
import time

import db
import events

KEEP = 14


def run(dest=None, keep=KEEP):
    """Write one copy, bring the key, prune. Returns the copy's path."""
    dest = dest or os.path.join(os.path.dirname(os.path.abspath(db.DB_PATH)), "backups")
    os.makedirs(dest, mode=0o700, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out = os.path.join(dest, f"namba-{stamp}.db")
    src = sqlite3.connect(db.DB_PATH)
    try:
        dst = sqlite3.connect(out)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()

    if os.path.isfile(events.SECRET_PATH):
        shutil.copy2(events.SECRET_PATH, os.path.join(dest, "secret.key"))  # keeps 0600
        key = "secret.key copied"
    else:
        key = "the key is in NAMBA_SECRET, not in this directory -- keep it too"

    copies = sorted(f for f in os.listdir(dest) if f.startswith("namba-") and f.endswith(".db"))
    gone = copies[:-keep] if keep > 0 else []
    for name in gone:
        os.remove(os.path.join(dest, name))
    print(f"{out}  ({os.path.getsize(out) / 1e6:.1f} MB); {key}; "
          f"{len(copies) - len(gone)} kept, {len(gone)} removed")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("dest", nargs="?", help="directory for the copies (default: backups/ beside the db)")
    ap.add_argument("--keep", type=int, default=KEEP, help=f"newest copies to keep (default {KEEP})")
    a = ap.parse_args()
    run(a.dest, a.keep)
