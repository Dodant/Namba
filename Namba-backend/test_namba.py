"""Self-check: python test_namba.py   (no pytest, no fixtures)"""
import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["NAMBA_DB"] = os.path.join(_tmp, "test.db")
os.environ["NAMBA_UPLOADS"] = os.path.join(_tmp, "uploads")
# A stand-in for the built front end. The real dist/ is a build artefact and is
# not in the repo, and what is being tested is the injection, not Vite's output.
os.environ["NAMBA_DIST"] = os.path.join(_tmp, "dist")
os.makedirs(os.path.join(_tmp, "dist", "assets"))
with open(os.path.join(_tmp, "dist", "index.html"), "w") as _fh:
    _fh.write(
        '<!doctype html>\n<html><head><title>Namba — a wiki of numbers</title>\n'
        '<meta name="description" content="Every number means something." />\n'
        "</head><body><div id=\"root\"></div></body></html>"
    )
with open(os.path.join(_tmp, "dist", "assets", "app.js"), "w") as _fh:
    _fh.write("console.log(1)")

from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
import main  # noqa: E402
from numfmt import bucket_of, parse_number  # noqa: E402

# The write limiter counts per IP, and the whole suite is one IP making a
# hundred writes in a second. Lift it here rather than thin it out in main.py,
# where it is the only thing between an open wiki and a script.
main.WRITE_LIMIT = 10_000


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


def test_share_card():
    """/p/12 has to arrive with its own <head>: no crawler runs the JS that
    would set it, which is the whole reason the API serves the front end."""
    c = TestClient(main.app)
    p = c.post("/api/posts", json={
        "value": "1729", "title": "Taxicab number",
        "body": "## Ramanujan\n\nThe **dullest** number, until [he](https://x.test) spoke.",
    }).json()

    page = c.get(f"/p/{p['id']}").text
    assert "<title>1729 — Taxicab number · Namba</title>" in page, page[:400]
    assert 'property="og:title" content="1729 — Taxicab number · Namba"' in page
    # the description is prose, not markdown source, and there is only one
    assert 'property="og:description" content="Ramanujan The dullest number, until he spoke."' in page
    assert page.count('name="description"') == 1
    assert 'property="og:url" content="http://testserver/p/%d"' % p["id"] in page
    assert 'property="twitter:card" content="summary"' in page
    assert "og:image" not in page, "no picture, so no image card"

    # an entry with a picture gets the big card, at an absolute url
    with_img = c.patch(f"/api/posts/{p['id']}", json={"image": "/uploads/x.png"}).json()
    page = c.get(f"/p/{with_img['id']}").text
    assert 'property="og:image" content="http://testserver/uploads/x.png"' in page
    assert 'property="twitter:card" content="summary_large_image"' in page

    # a title with a quote in it must not break out of the attribute
    ev = c.post("/api/posts", json={"value": "13", "title": 'the "unlucky" <one>'}).json()
    page = c.get(f"/p/{ev['id']}").text
    assert "<one>" not in page and "&lt;one&gt;" in page, "markup got through"

    # every other route is the app as built, and the api still answers first
    assert "<title>Namba — a wiki of numbers</title>" in c.get("/n/42").text
    assert c.get("/assets/app.js").text == "console.log(1)"
    assert c.get("/api/tags").status_code == 200
    assert c.get(f"/p/{p['id']}999").text.count("og:title") == 0, "unknown id got a card"
    # ".." off the wire must not walk out of dist
    assert c.get("/../test.db").status_code in (200, 404) and "sqlite" not in c.get("/../test.db").text.lower()


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
    # ...and enough of each entry to read the list without opening a post
    assert forty_two["entries"][0]["body"] == a["body"]
    assert forty_two["entries"][0]["image"] is False
    assert forty_two["entries"][1]["body"] == ""

    # a long body is cut, not shipped whole -- the index is a list, not a mirror
    c.post("/api/posts", json={"value": "42", "title": "long one", "body": "x" * 500})
    nums = c.get("/api/numbers", params={"format": "INTEGER"}).json()
    blurb = next(x for x in nums if x["value"] == "42")["entries"][2]["body"]
    assert len(blurb) == main.BLURB + 1 and blurb.endswith("\u2026"), blurb

    # a number containing a slash survives the round trip as a query param
    slash = c.post("/api/posts", json={"value": "11/22/63", "title": "11/22/63",
                                       "tags": ["BOOK"]}).json()
    assert slash["format"] == "MIXED"
    assert len(c.get("/api/posts", params={"value": "11/22/63"}).json()) == 1

    # tag filter
    movies = c.get("/api/posts", params={"tag": "MOVIE"}).json()
    assert [p["title"] for p in movies] == ["Us (Jeremiah 11:11)"]

    # sort=random actually reorders. An unknown sort falls back to p.id rather
    # than 422ing, so a typo on either side of the wire would leave a Random
    # button that works and always lands on the same entry.
    ids = sorted(p["id"] for p in c.get("/api/posts").json())
    assert len(ids) > 4, ids
    draws = {c.get("/api/posts", params={"sort": "random", "limit": 1}).json()[0]["id"]
             for _ in range(40)}
    assert len(draws) > 1, draws
    assert draws <= set(ids), draws

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

    # another language sits beside the entry rather than on top of it
    tid = b["id"]
    tr = c.put(f"/api/posts/{tid}/translations", json={
        "lang": "Korean", "title": "재키 로빈슨", "body": "42번", "author": "오",
    }).json()
    assert tr["title"] == "Jackie Robinson", "the translation replaced the entry"
    assert [t["lang"] for t in tr["translations"]] == ["Korean"]
    assert tr["translations"][0]["author"] == "오"
    assert tr["translations"][0]["edited_by"] is None

    # the same language again is an edit, whatever the casing, and the first
    # translator keeps the byline
    same = c.put(f"/api/posts/{tid}/translations", json={
        "lang": "korean", "title": "재키 로빈슨 (야구)", "author": "vogon",
    }).json()
    assert len(same["translations"]) == 1, "korean and Korean became two tabs"
    assert same["translations"][0]["title"] == "재키 로빈슨 (야구)"
    assert same["translations"][0]["author"] == "오", "the first translator was overwritten"
    assert same["translations"][0]["edited_by"] == "vogon"

    assert c.put(f"/api/posts/{tid}/translations",
                 json={"lang": "   ", "title": "x"}).status_code == 422

    # an edit can clear the image, and an edit that never mentions it leaves
    # it alone. PATCH treats an absent field as "unchanged", so those two have
    # to be told apart or the form's Remove button is a no-op.
    shot = c.post("/api/posts", json={"value": "77", "title": "with a picture",
                                      "image": "/uploads/x.png"}).json()
    assert shot["image"] == "/uploads/x.png"
    c.patch(f"/api/posts/{shot['id']}", json={"image": None, "author": "ed"})
    assert c.get(f"/api/posts/{shot['id']}").json()["image"] is None
    c.patch(f"/api/posts/{shot['id']}", json={"image": "/uploads/y.png"})
    c.patch(f"/api/posts/{shot['id']}", json={"title": "renamed"})
    assert c.get(f"/api/posts/{shot['id']}").json()["image"] == "/uploads/y.png"

    # an entry records the language it is itself written in, free-form like a
    # translation label. Blank is NULL, not "", so there is one kind of empty.
    ko = c.post("/api/posts", json={"value": "88", "title": "피아노",
                                    "lang": " 한국어 ", "author": "seed"}).json()
    assert ko["lang"] == "한국어"
    assert c.post("/api/posts", json={"value": "89", "title": "x",
                                      "lang": "  "}).json()["lang"] is None

    # an edit that does not mention it leaves it; null clears it
    c.patch(f"/api/posts/{ko['id']}", json={"title": "피아노 건반", "author": "ed"})
    assert c.get(f"/api/posts/{ko['id']}").json()["lang"] == "한국어"
    c.patch(f"/api/posts/{ko['id']}", json={"lang": None, "author": "ed"})
    assert c.get(f"/api/posts/{ko['id']}").json()["lang"] is None

    # and it rides in the snapshot, so a restore puts it back
    rev = c.get(f"/api/posts/{ko['id']}/revisions").json()[0]
    assert c.post(f"/api/posts/{ko['id']}/revisions/{rev['id']}/restore",
                  json={"author": "arthur"}).json()["lang"] == "한국어"

    # a list reads in the language the reader asked for, and falls back to the
    # entry as written wherever nobody has written that language yet
    assert c.get("/api/languages").json() == [{"lang": "Korean", "count": 1}]
    ko = c.get("/api/posts", params={"value": "42", "lang": "korean"}).json()
    by_id = {p["id"]: p["title"] for p in ko}
    assert by_id[tid] == "재키 로빈슨 (야구)", "the Korean translation was not used"
    assert by_id[a["id"]] == a["title"], "an untranslated entry lost its original"
    # an empty page still has to build valid SQL -- "post_id IN ()" is a syntax
    # error, so the id filter has to notice it has nothing to filter on
    assert c.get("/api/posts", params={"q": "zznothing", "lang": "Korean"}).json() == []

    # no language asked for is no substitution, not a default one
    plain = {p["id"]: p["title"] for p in c.get("/api/posts",
                                                params={"value": "42"}).json()}
    assert plain[tid] == "Jackie Robinson", plain[tid]
    # and the index goes through the same lookup
    nums = c.get("/api/numbers", params={"format": "INTEGER", "lang": "Korean"}).json()
    titles = [e["title"] for x in nums if x["value"] == "42" for e in x["entries"]]
    assert "재키 로빈슨 (야구)" in titles, titles

    # a removed translation is recoverable, same as any other edit
    gone = c.delete(f"/api/posts/{tid}/translations/{same['translations'][0]['id']}",
                    params={"author": "zaphod"}).json()
    assert gone["translations"] == []
    last = c.get(f"/api/posts/{tid}/revisions").json()[0]
    back = c.post(f"/api/posts/{tid}/revisions/{last['id']}/restore",
                  json={"author": "arthur"}).json()
    assert [t["title"] for t in back["translations"]] == ["재키 로빈슨 (야구)"]

    # the index stays out of it -- translations are a post-page concern
    assert "translations" not in c.get("/api/posts", params={"value": "42"}).json()[0]

    # ...but search does look inside them, or an English title on a Korean
    # entry would be unfindable in the language the site is written in
    c.put(f"/api/posts/{tid}/translations", json={
        "lang": "English", "title": "Jackie Robinson, number 42", "body": "Brooklyn Dodgers",
    })
    assert [p["id"] for p in c.get("/api/posts", params={"q": "Dodgers"}).json()] == [tid]
    assert len(c.get("/api/posts", params={"q": "Jackie"}).json()) == 1, "matched twice"

    # and the English version is what the index shows a reader who asked for
    # English. That used to be hardcoded here; it is the reader's setting now,
    # and the front end still defaults it to English so this is what most see.
    def index_entry(**params):
        return next(
            e for n in c.get("/api/numbers", params={"format": "INTEGER", **params}).json()
            if n["value"] == "42" for e in n["entries"] if e["id"] == tid
        )

    entry = index_entry(lang="English")
    assert entry["title"] == "Jackie Robinson, number 42"
    assert entry["body"] == "Brooklyn Dodgers"
    assert entry["likes"] == 0, "the count is the post's, not the translation's"

    # asking for nothing substitutes nothing -- the endpoint carries no policy
    # about which language a reader wants
    assert index_entry()["title"] == "Jackie Robinson"
    # nor does a language nobody has written this entry in
    assert index_entry(lang="Volapük")["title"] == "Jackie Robinson"

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

    # ...and that snapshot can actually put it back, under the same id, or the
    # revisions kept for it would describe a post that no longer exists
    dead = c.get(f"/api/posts/{slash['id']}/revisions").json()[0]
    alive = c.post(f"/api/posts/{slash['id']}/revisions/{dead['id']}/restore",
                   json={"author": "arthur"}).json()
    assert alive["id"] == slash["id"] and alive["value"] == "11/22/63"
    assert alive["author"] == slash["author"], "the original writer was lost"
    assert alive["edited_by"] == "arthur"
    assert alive["tags"] == ["BOOK"]
    assert c.get(f"/api/posts/{slash['id']}").status_code == 200

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
