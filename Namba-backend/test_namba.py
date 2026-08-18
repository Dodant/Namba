"""Self-check: python test_namba.py   (no pytest, no fixtures)"""
import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["NAMBA_DB"] = os.path.join(_tmp, "test.db")
os.environ["NAMBA_UPLOADS"] = os.path.join(_tmp, "uploads")

from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
import main  # noqa: E402
from numfmt import bucket_of, parse_number  # noqa: E402


def test_parse():
    cases = {
        "42": ("INTEGER", 42.0),
        "299792458": ("INTEGER", 299792458.0),
        "3.14": ("DECIMAL", 3.14),
        "42.195": ("DECIMAL", 42.195),
        "273.15": ("DECIMAL", 273.15),
        "10:04PM": ("TIME", 22 * 60 + 4),      # 22:04
        "12:07AM": ("TIME", 7),                # just past midnight
        "02:17AM": ("TIME", 137),
        "09:41": ("TIME", 581),
        "11:11": ("TIME", 671),
        "1:29:300": ("MIXED", None),           # Heinrich's law, not a clock
        "11/22/63": ("MIXED", None),
        "3.15.20": ("MIXED", None),            # two dots
        "80/20": ("MIXED", None),
        "40-40": ("MIXED", None),
        "9¾": ("MIXED", None),
        "24/7": ("MIXED", None),
        "25:99": ("MIXED", None),              # colon, but no such time
        "": ("MIXED", None),
    }
    for raw, want in cases.items():
        got = parse_number(raw)
        assert got == want, f"parse_number({raw!r}) = {got}, want {want}"


def test_bucket():
    for key, want in [
        (9, "1"), (9.99, "1"), (10, "10"), (99, "10"), (100, "100"),
        (999, "100"), (1000, "1000"), (9999, "1000"), (10000, "10000+"),
        (299792458, "10000+"), (None, None),
    ]:
        assert bucket_of(key) == want, f"bucket_of({key}) = {bucket_of(key)}, want {want}"
    # only integers get banded: 09:41 is 581 minutes, not a three-digit number
    assert bucket_of(581.0, "TIME") is None
    assert bucket_of(3.14, "DECIMAL") is None


def test_api_round_trip():
    c = TestClient(main.app)

    a = c.post("/api/posts", json={
        "value": "42", "title": "The Hitchhiker's Guide to the Galaxy",
        "body": "The Answer to Life, the Universe, and Everything.",
        "tags": ["BOOK", "meme"], "author": "ford",
    })
    assert a.status_code == 201, a.text
    a = a.json()
    assert a["format"] == "INTEGER" and a["sort_key"] == 42.0
    assert a["tags"] == ["BOOK", "MEME"], a["tags"]   # normalised + sorted
    assert a["bucket"] == "10"
    assert a["author"] == "ford" and a["edited_by"] is None

    b = c.post("/api/posts", json={
        "value": "42", "title": "Jackie Robinson", "tags": ["SPORTS", "PERSON"],
    }).json()

    # a bad tag is rejected, not silently dropped
    assert c.post("/api/posts", json={"value": "1", "title": "x",
                                      "tags": ["NOPE"]}).status_code == 422

    # the poster may override the parser
    t = c.post("/api/posts", json={"value": "11:11", "title": "Us (Jeremiah 11:11)",
                                   "format": "MIXED", "tags": ["MOVIE"]}).json()
    assert t["format"] == "MIXED" and t["sort_key"] is None and t["bucket"] is None

    clock = c.post("/api/posts", json={"value": "09:41", "title": "iPhone keynote",
                                       "tags": ["BRAND"]}).json()
    assert clock["format"] == "TIME" and clock["sort_key"] == 581 and clock["bucket"] is None

    # index groups by number
    nums = c.get("/api/numbers", params={"format": "INTEGER"}).json()
    forty_two = next(x for x in nums if x["value"] == "42")
    assert forty_two["bucket"] == "10"
    # the index carries each number's entries so the list view can link straight
    # to them, in the same order the number page shows
    assert [e["title"] for e in forty_two["entries"]] == [a["title"], b["title"]]
    assert [e["id"] for e in forty_two["entries"]] == [a["id"], b["id"]]
    assert "body" not in forty_two["entries"][0], "index should stay lean"

    # a number containing a slash survives the round trip as a query param
    slash = c.post("/api/posts", json={"value": "11/22/63", "title": "11/22/63",
                                       "tags": ["BOOK"]}).json()
    assert slash["format"] == "MIXED"
    assert len(c.get("/api/posts", params={"value": "11/22/63"}).json()) == 1

    # tag filter
    movies = c.get("/api/posts", params={"tag": "MOVIE"}).json()
    assert [p["title"] for p in movies] == ["Us (Jeremiah 11:11)"]

    # likes
    assert c.post(f"/api/posts/{a['id']}/like").json()["likes"] == 1
    assert c.delete(f"/api/posts/{a['id']}/like").json()["likes"] == 0
    assert c.delete(f"/api/posts/{a['id']}/like").json()["likes"] == 0  # never negative

    # manual link, visible from both sides
    c.post(f"/api/posts/{a['id']}/links", json={"other_id": b["id"]})
    assert [r["id"] for r in c.get(f"/api/posts/{a['id']}").json()["related"]] == [b["id"]]
    assert [r["id"] for r in c.get(f"/api/posts/{b['id']}").json()["related"]] == [a["id"]]
    assert c.post(f"/api/posts/{a['id']}/links",
                  json={"other_id": a["id"]}).status_code == 400
    c.delete(f"/api/posts/{a['id']}/links/{b['id']}")
    assert c.get(f"/api/posts/{a['id']}").json()["related"] == []

    # a stranger may edit, and doing so must not erase who wrote it
    edited = c.patch(f"/api/posts/{a['id']}",
                     json={"title": "VANDALISED", "author": "vogon"}).json()
    assert edited["title"] == "VANDALISED"
    assert edited["author"] == "ford", "the original author was overwritten"
    assert edited["edited_by"] == "vogon"
    assert edited["updated_at"] >= edited["created_at"]
    assert edited["tags"] == ["BOOK", "MEME"]        # untouched fields survive

    # the previous version, and who replaced it, are both recoverable
    revs = c.get(f"/api/posts/{a['id']}/revisions").json()
    assert len(revs) == 1 and revs[0]["snapshot"]["title"].startswith("The Hitch")
    assert revs[0]["author"] == "vogon"
    restored = c.post(f"/api/posts/{a['id']}/revisions/{revs[0]['id']}/restore",
                      json={"author": "arthur"}).json()
    assert restored["title"] == "The Hitchhiker's Guide to the Galaxy"
    assert restored["tags"] == ["BOOK", "MEME"]
    assert restored["author"] == "ford" and restored["edited_by"] == "arthur"

    # restoring is itself an edit, so it too can be undone
    assert len(c.get(f"/api/posts/{a['id']}/revisions").json()) == 2

    # a delete leaves a recoverable snapshot behind
    c.delete(f"/api/posts/{slash['id']}")
    assert c.get(f"/api/posts/{slash['id']}").status_code == 404
    assert c.get(f"/api/posts/{slash['id']}/revisions").json()[0]["snapshot"]["title"] \
        == "11/22/63"

    # uploads: extension allowlist, server-generated filename
    assert c.post("/api/upload", files={"file": ("evil.svg", b"<svg/>",
                                                 "image/svg+xml")}).status_code == 400
    up = c.post("/api/upload", files={"file": ("../../etc/passwd.png", b"\x89PNG",
                                               "image/png")})
    assert up.status_code == 200 and up.json()["url"].startswith("/uploads/")
    assert ".." not in up.json()["url"]

    tags = {t["tag"]: t["count"] for t in c.get("/api/tags").json()}
    assert len(tags) == 20 and tags["MOVIE"] == 1 and tags["ANIME"] == 0


def test_connection_crosses_threads():
    """FastAPI opens the connection on one threadpool thread and runs the
    endpoint on another. TestClient funnels everything through a single portal
    thread and so cannot reproduce that -- assert the property directly."""
    import threading

    con = db.connect()
    err = []
    t = threading.Thread(target=lambda: err.append(
        None if con.execute("SELECT 1").fetchone() else "no row"))
    t.start()
    t.join()
    assert err == [None], err
    con.close()


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
    print("all good")
