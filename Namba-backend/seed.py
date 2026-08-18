"""Load 'Memorable Numbers.md' into the wiki.  python seed.py --reset

The source file already carries its own categories in the prefix -- Movie "X",
Book "X", Brand "X" -- so most tagging is free. Entries the parser cannot
classify go in untagged, and are reported rather than guessed at.
"""
import os
import re
import sys

import db
from numfmt import parse_number
from seed_tags import SEED_TAGS

SOURCE = os.path.join(os.path.dirname(db.DIR), "Memorable Numbers.md")

# the file's own prefixes, typos and all ("Moive" appears ~15 times)
PREFIX_TAG = {
    "movie": "MOVIE", "moive": "MOVIE", "film": "MOVIE",
    "book": "BOOK", "comic": "BOOK",       # no COMIC tag; comics live under BOOK
    "drama": "TV", "series": "TV",
    "anime": "ANIME", "music": "MUSIC", "game": "GAME", "brand": "BRAND",
}

ENTRY = re.compile(r"^-\s+(.+?)\s+-\s+(.+)$")
BARE = re.compile(r"^-\s+(\S+)\s*$")            # "- 69" with nothing after it
TRAILING_PAREN = re.compile(r"^(.*?)\s*\(([^()]*)\)$")
PREFIXED = re.compile(r"^(\w+)\s+(.+)$")


def parse(text):
    entries, skipped = [], []
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#") or line.strip() == "---":
            continue

        if not line.startswith("-"):            # indented continuation line
            extra = line.strip().strip("()")
            if entries and extra:
                entries[-1]["body"] = (entries[-1]["body"] + "\n" + extra).strip()
            continue

        m = ENTRY.match(line.rstrip())
        if not m:
            bare = BARE.match(line.rstrip())
            if bare:
                skipped.append(bare.group(1).strip("*"))
            continue

        value = m.group(1).strip().strip("*")
        rest = m.group(2).strip()

        body = ""
        paren = TRAILING_PAREN.match(rest)
        if paren:
            rest, body = paren.group(1).strip(), paren.group(2).strip()

        tags = []
        pm = PREFIXED.match(rest)
        if pm and pm.group(1).lower() in PREFIX_TAG:
            tags = [PREFIX_TAG[pm.group(1).lower()]]
            rest = pm.group(2)

        title = rest.replace('"', "").strip().strip("*")
        tags = tags or SEED_TAGS.get(title, [])
        fmt, key = parse_number(value)
        entries.append({"value": value, "format": fmt, "sort_key": key,
                        "title": title, "body": body, "tags": tags})
    return entries, skipped


def load(entries):
    con = db.connect()
    with con:
        for e in entries:
            cur = con.execute(
                """INSERT INTO posts (value, format, sort_key, title, body, author,
                                      created_at, updated_at)
                   VALUES (?,?,?,?,?,'seed',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now'))""",
                (e["value"], e["format"], e["sort_key"], e["title"], e["body"]),
            )
            for t in e["tags"]:
                con.execute("INSERT INTO post_tags (post_id, tag) VALUES (?,?)",
                            (cur.lastrowid, t))
    con.close()


def main():
    if "--reset" in sys.argv and os.path.exists(db.DB_PATH):
        os.remove(db.DB_PATH)
    db.init()

    entries, skipped = parse(open(SOURCE, encoding="utf-8").read())
    load(entries)

    print(f"seeded {len(entries)} posts from {os.path.basename(SOURCE)}")
    by_format = {}
    for e in entries:
        by_format[e["format"]] = by_format.get(e["format"], 0) + 1
    print("  formats:", ", ".join(f"{k}={v}" for k, v in sorted(by_format.items())))

    if skipped:
        print(f"\nskipped {len(skipped)} (a number with no meaning attached): "
              + ", ".join(skipped))

    untagged = [e for e in entries if not e["tags"]]
    print(f"\n{len(untagged)} entries left untagged (not matched by a prefix or by "
          "seed_tags.py) -- tag them in the wiki:")
    for e in untagged:
        print(f"  {e['value']:<12} {e['title']}")

    korean = [e for e in entries if re.search(r"[가-힣]", e["title"])]
    print(f"\n{len(korean)} entries have Korean titles; the site is English, so these "
          "need a human. Left verbatim on purpose -- no machine translation:")
    for e in korean:
        print(f"  {e['value']:<12} {e['title']}")

    for e in entries:
        if e["value"] == "801.11":
            print("\nnote: 801.11 (Wi-Fi) looks like a typo for 802.11. Seeded as "
                  "written -- correcting the source data is the wiki's job, not mine.")


if __name__ == "__main__":
    main()
