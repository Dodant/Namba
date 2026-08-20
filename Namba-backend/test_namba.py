"""Self-check: python test_namba.py   (no pytest, no fixtures)"""
import json
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

import admin  # noqa: E402
import db  # noqa: E402
import events  # noqa: E402
import main  # noqa: E402
from numfmt import bucket_of, grouped_value, parse_number  # noqa: E402

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


def test_recent_sort():
    """The feed is last touched, not first written -- an edit to an old entry
    has to come back to the top, or most of what happens on a wiki never shows.
    The clock is stubbed because now() is second-resolution and the whole test
    fits inside one tick, which would leave the order to the id tiebreak."""
    c = TestClient(main.app)
    real = main.now
    ticks = iter(f"2999-01-01T00:00:0{i}+00:00" for i in range(9))
    main.now = lambda: next(ticks)
    try:
        first = c.post("/api/posts", json={"value": "9001", "title": "written first"}).json()
        second = c.post("/api/posts", json={"value": "9002", "title": "written second"}).json()
        top = lambda: [p["id"] for p in
                       c.get("/api/posts", params={"sort": "recent", "limit": 2}).json()]
        assert top() == [second["id"], first["id"]], top()
        c.patch(f"/api/posts/{first['id']}", json={"title": "and then edited"})
        assert top() == [first["id"], second["id"]], "an edit did not lift it"
    finally:
        main.now = real
    for p in (first, second):
        admin.set_status(p["id"], "HIDDEN")


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


def _events(**where):
    """Straight out of the table. There is no endpoint over it yet -- the
    operator's reads arrive with the admin router -- and this is the layer
    underneath them."""
    con = db.connect()
    try:
        sql = "SELECT * FROM events"
        if where:
            sql += " WHERE " + " AND ".join(f"{k} = ?" for k in where)
        return [dict(r) for r in con.execute(sql + " ORDER BY id",
                                            tuple(where.values()))]
    finally:
        con.close()


def test_events_log_every_write():
    """The log is the activity feed, the audit trail and the spam evidence at
    once, so every write that changes something has to land in it -- and the
    reads must not, or a page view would be the loudest thing in the table.
    """
    c = TestClient(main.app)
    before = len(_events())
    # a user agent of its own: TestClient sends "testclient" as both the client
    # address and the UA, so the two hashes would match for a reason that has
    # nothing to do with the code
    p = c.post("/api/posts", json={"value": "1123", "title": "Fibonacci-ish",
                                   "author": "leonardo"},
               headers={"user-agent": "namba-test/1.0"}).json()
    pid = p["id"]
    other = c.post("/api/posts", json={"value": "1124", "title": "one along"}).json()
    c.patch(f"/api/posts/{pid}", json={"title": "Fibonacci", "author": "pisa"})
    c.put(f"/api/posts/{pid}/translations",
          json={"lang": "Latin", "title": "Fibonacci", "body": "", "author": "pisa"})
    c.post(f"/api/posts/{pid}/comments", json={"body": "1 1 2 3", "author": "ada"})
    c.post(f"/api/posts/{pid}/links", json={"other_id": other["id"]})
    c.post(f"/api/posts/{pid}/like")        # a write, and deliberately not logged
    c.get(f"/api/posts/{pid}")              # reads log nothing at all
    c.get("/api/numbers")
    c.get(f"/api/posts/{pid}/revisions")

    mine = [r for r in _events(target_id=pid) if r["target_type"] == "post"]
    assert [r["action"] for r in mine] == [
        "CREATE", "EDIT", "TRANSLATE", "COMMENT", "LINK"], [r["action"] for r in mine]
    assert len(_events()) == before + 6, "a read or a like reached the table"

    create, edit, translate, comment, link = mine
    assert create["actor"] == "leonardo", create
    assert json.loads(create["meta"])["value"] == "1123"
    assert create["revision_id"] is None, "a create has no prior state to point at"
    assert json.loads(translate["meta"])["lang"] == "Latin"
    assert comment["revision_id"] is None, "a comment takes no snapshot"
    assert json.loads(link["meta"])["other"] == other["id"]

    # "who did this" and "what it was before" are one join apart, which is the
    # whole reason a revision id is on the row
    assert edit["revision_id"], "an edit did not point at the snapshot it pushed"
    con = db.connect()
    try:
        was = con.execute("SELECT snapshot FROM revisions WHERE id = ?",
                          (edit["revision_id"],)).fetchone()
    finally:
        con.close()
    assert json.loads(was["snapshot"])["title"] == "Fibonacci-ish"

    # no address reaches the table, in any column, ever
    assert len(create["ip_hash"]) == 64 and len(create["ua_hash"]) == 64
    assert create["ip_hash"] != create["ua_hash"], "one hash is doing both jobs"
    assert "testclient" not in " ".join(
        str(v) for r in _events() for v in r.values() if v is not None), \
        "the raw client address reached the table"

    # nothing has told this visitor apart from any other yet
    assert create["client_hash"] is None

    # the document is where the cookie is set, so that a page load sets it once
    # rather than once per asset
    assert events.COOKIE not in c.cookies
    assert c.get(f"/p/{pid}").cookies[events.COOKIE]
    c.post(f"/api/posts/{pid}/comments", json={"body": "and now with a cookie"})
    tagged = _events(action="COMMENT")[-1]
    assert tagged["client_hash"] and tagged["client_hash"] != tagged["ip_hash"]
    admin.set_status(pid, "HIDDEN")
    admin.set_status(other["id"], "HIDDEN")


def test_client_secret_is_durable():
    """A key that changed on restart would void every stored block and orphan
    every hash in events without one thing failing loudly, so it is written
    beside the database rather than left to an environment variable somebody
    forgets. It belongs in the backup with the database."""
    assert events.SECRET == events._secret(), "a second read produced another key"
    assert oct(os.stat(events._SECRET_PATH).st_mode)[-3:] == "600", "world-readable"

    # and it is the whole reason the hash is not just the address in disguise:
    # under another install's key the same address is another hash
    here = events._hash("203.0.113.9")
    was = events.SECRET
    try:
        events.SECRET = b"another install entirely"
        assert events._hash("203.0.113.9") != here, "the key is not in the hash"
    finally:
        events.SECRET = was
    assert events._hash("203.0.113.9") == here


def test_grouping():
    """Separators are a way of writing the number, never part of it."""
    assert grouped_value("1000", True) == "1,000"
    assert grouped_value("1000", False) == "1000"
    assert grouped_value("299792458", True) == "299,792,458"
    assert grouped_value("100", True) == "100", "no thousand to separate"
    assert grouped_value("1234.5678", True) == "1,234.5678", "only the whole part"
    # nothing that is not a plain number is touched
    for odd in ("10:04PM", "11/22/63", "9\u00be", "80/20"):
        assert grouped_value(odd, True) == odd, odd

    c = TestClient(main.app)
    # 1000 and 1,000 are one number at one address, whatever the box says --
    # a separator never reaches the column, or /n/1000 and /n/1%2C000 become
    # two pages about it
    typed = c.post("/api/posts", json={"value": "1,000", "title": "a grand",
                                       "grouped": True}).json()
    assert typed["value"] == "1000", typed["value"]
    assert typed["format"] == "INTEGER" and typed["sort_key"] == 1000.0
    assert typed["bucket"] == "1000"

    # ...including with the box off. Typing the commas is how you ask for
    # them, so the flag follows rather than the separator being swallowed.
    off = c.post("/api/posts", json={"value": "1,000", "title": "typed it out"}).json()
    assert off["value"] == "1000" and off["format"] == "INTEGER", off
    assert off["grouped"] is True, "the typed separators were thrown away"
    assert len(c.get("/api/posts", params={"value": "1000"}).json()) == 2, \
        "the two spellings did not land on the same number"

    # a comma that is not a thousands separator is left alone
    for odd in ("1,2,3", "12,34", "Apollo,11"):
        assert c.post("/api/posts", json={"value": odd, "title": odd}
                      ).json()["value"] == odd, odd
    admin.set_status(off["id"], "HIDDEN")

    def row(**params):
        nums = c.get("/api/numbers", params={"format": "INTEGER", **params}).json()
        return next(n for n in nums if n["value"] == "1000")

    # one entry, and it asked for separators
    assert row()["grouped"] is True

    # a second entry that did not: the row falls back to the plain form, since
    # that is the one nobody had to opt into
    plain = c.post("/api/posts", json={"value": "1000", "title": "no commas"}).json()
    assert row()["grouped"] is False

    # and it comes back once the disagreement goes -- an entry taken off the
    # wiki gets no vote on how its number is written
    admin.set_status(plain["id"], "HIDDEN")
    assert row()["grouped"] is True

    # the preference survives an edit that never mentions it, and a restore
    c.patch(f"/api/posts/{typed['id']}", json={"title": "a grand, renamed"})
    assert c.get(f"/api/posts/{typed['id']}").json()["grouped"] is True
    c.patch(f"/api/posts/{typed['id']}", json={"grouped": False})
    assert c.get(f"/api/posts/{typed['id']}").json()["grouped"] is False
    rev = c.get(f"/api/posts/{typed['id']}/revisions").json()[0]
    back = c.post(f"/api/posts/{typed['id']}/revisions/{rev['id']}/restore").json()
    assert back["grouped"] is True

    # and the share card reads the number the way the entry asks for it
    assert "<title>1,000 — " in c.get(f"/p/{typed['id']}").text


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
    assert a["tags"] == ["book", "meme"], a["tags"]   # normalised + sorted
    assert a["bucket"] == "10"
    assert a["author"] == "ford" and a["edited_by"] is None

    b = c.post("/api/posts", json={
        "value": "42", "title": "Jackie Robinson", "tags": ["SPORTS", "PERSON"],
    }).json()

    # an unfamiliar tag is coined, not rejected -- there is no list to be off
    assert c.post("/api/posts", json={"value": "1", "title": "x",
                                      "tags": ["NOPE"]}).json()["tags"] == ["nope"]

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

    # a tag is whatever people call it, normalised so one idea is one tag --
    # Music and MUSIC collapse, which is what keeps this inside the cap of two
    coined = c.post("/api/posts", json={
        "value": "808", "title": "808 drum machine",
        "tags": ["  Drum  Machine ", "Music", "MUSIC"],
    }).json()
    assert coined["tags"] == ["drum machine", "music"], coined["tags"]

    # two is the cap, and it is the widest an entry honestly is
    assert c.post("/api/posts", json={"value": "1", "title": "x",
                                      "tags": ["a", "b", "c"]}).status_code == 422
    assert c.post("/api/posts", json={"value": "1", "title": "x",
                                      "tags": ["a", "b"]}).status_code == 201

    # shape is checked, membership is not
    for bad in (["hip/hop"], ["   "], ["x" * 25], list("abcdef")):
        assert c.post("/api/posts", json={"value": "1", "title": "x", "tags": bad}
                      ).status_code == 422, bad

    # and the coined one joins the wiki's vocabulary, which is read off the
    # posts rather than a list in main.py
    vocab = {t["tag"]: t["count"] for t in c.get("/api/tags").json()}
    assert vocab["drum machine"] == 1, vocab
    assert "unit" not in vocab, "an unused tag is not part of the vocabulary"
    assert list(vocab) == sorted(vocab, key=lambda t: (-vocab[t], t)), "not by count"
    assert [p["id"] for p in c.get("/api/posts", params={"tag": "DRUM Machine"}).json()] \
        == [coined["id"]], "the filter is case-insensitive on the way in"
    admin.set_status(coined["id"], "HIDDEN")
    assert "drum machine" not in {t["tag"] for t in c.get("/api/tags").json()}, \
        "a hidden entry was still speaking for the vocabulary"

    # tag filter
    movies = c.get("/api/posts", params={"tag": "MOVIE"}).json()  # any case in
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
    assert edited["tags"] == ["book", "meme"]        # untouched fields survive

    # the previous version, and who replaced it, are both recoverable
    revs = c.get(f"/api/posts/{a['id']}/revisions").json()
    assert len(revs) == 1 and revs[0]["snapshot"]["title"].startswith("The Hitch")
    assert revs[0]["author"] == "vogon"
    restored = c.post(f"/api/posts/{a['id']}/revisions/{revs[0]['id']}/restore",
                      json={"author": "arthur"}).json()
    assert restored["title"] == "The Hitchhiker's Guide to the Galaxy"
    assert restored["tags"] == ["book", "meme"]
    assert restored["author"] == "ford" and restored["edited_by"] == "arthur"

    # restoring is itself an edit, so it too can be undone
    assert len(c.get(f"/api/posts/{a['id']}/revisions").json()) == 2

    # taking an entry off the wiki needs no snapshot and loses nothing: the row
    # stays, so the history stays whole and showing it again is one column
    admin.set_status(slash["id"], "HIDDEN")
    assert c.get(f"/api/posts/{slash['id']}").status_code == 404
    assert c.get(f"/api/posts/{slash['id']}/revisions").status_code == 404, \
        "a hidden entry's history was readable"
    admin.set_status(slash["id"], "ACTIVE")
    assert c.get(f"/api/posts/{slash['id']}").json()["value"] == "11/22/63"

    # The branch in restore_revision that puts back a post whose *row* is gone
    # is legacy: no route removes a row any more. But the rows the DELETE route
    # that used to exist took away are still out there, and their snapshots are
    # the only copy left of them -- so it stays, and stays covered. Reaching
    # that state now takes the database directly, which is the point.
    c.patch(f"/api/posts/{slash['id']}",
            json={"title": "November 22", "author": "oswald"})
    con = db.connect()
    with con:
        con.execute("DELETE FROM posts WHERE id = ?", (slash["id"],))
    con.close()
    assert c.get(f"/api/posts/{slash['id']}").status_code == 404
    dead = c.get(f"/api/posts/{slash['id']}/revisions").json()[0]
    assert dead["snapshot"]["title"] == "11/22/63"
    alive = c.post(f"/api/posts/{slash['id']}/revisions/{dead['id']}/restore",
                   json={"author": "arthur"}).json()
    assert alive["id"] == slash["id"] and alive["value"] == "11/22/63"
    assert alive["author"] == slash["author"], "the original writer was lost"
    assert alive["edited_by"] == "arthur"
    assert alive["tags"] == ["book"], "the tags cascaded away and were not rebuilt"
    assert c.get(f"/api/posts/{slash['id']}").status_code == 200

    # uploads: extension allowlist, server-generated filename
    assert c.post("/api/upload", files={"file": ("evil.svg", b"<svg/>",
                                                 "image/svg+xml")}).status_code == 400
    up = c.post("/api/upload", files={"file": ("../../etc/passwd.png", b"\x89PNG",
                                               "image/png")})
    assert up.status_code == 200 and up.json()["url"].startswith("/uploads/")
    assert ".." not in up.json()["url"]

    # and a ceiling on the directory as a whole: the per-file cap alone still
    # lets one IP push 100 MB a minute onto the disk holding the database
    was, main.UPLOAD_TOTAL_MAX = main.UPLOAD_TOTAL_MAX, main.uploads_bytes()
    try:
        full = c.post("/api/upload", files={"file": ("one.png", b"\x89PNG", "image/png")})
        assert full.status_code == 507, full.status_code
    finally:
        main.UPLOAD_TOTAL_MAX = was

    # the vocabulary is what is in use, so an unused tag is simply not in it
    tags = {t["tag"]: t["count"] for t in c.get("/api/tags").json()}
    assert tags["movie"] == 1 and "anime" not in tags, tags


def test_hidden_is_invisible():
    """Hiding an entry takes it off the wiki, not out of one view of it.

    Nine public reads carry the status condition and missing one leaks the body
    of something an operator took down, so this walks all nine: the index, both
    list endpoints, the entry itself, the two vocabularies, its row among
    another entry's related entries, its history, the talk beside it, and the
    <head> written server-side for /p/{id}.

    It moves the column through admin.py because that is the only thing that
    can -- the operator's endpoints arrive with the admin router, and this is
    the layer underneath them.
    """
    c = TestClient(main.app)
    p = c.post("/api/posts", json={
        "value": "6174", "title": "Kaprekar's constant",
        "body": "Four digits, four steps, and it is always this.",
        "tags": ["kaprekar"], "lang": "English", "author": "kaprekar",
    }).json()
    pid = p["id"]
    other = c.post("/api/posts", json={"value": "6175", "title": "one along"}).json()
    c.put(f"/api/posts/{pid}/translations",
          json={"lang": "Klingon", "title": "loSmaH", "body": "loS", "author": "worf"})
    c.post(f"/api/posts/{pid}/comments", json={"body": "It really is every time."})
    c.post(f"/api/posts/{pid}/links", json={"other_id": other["id"]})
    c.patch(f"/api/posts/{pid}", json={"title": "Kaprekar constant", "author": "d.r."})

    def seen():
        """Every way a reader could reach this entry. Unique tag and language on
        purpose: a shared one would be kept alive by somebody else's entry and
        the assertion would pass without the join doing anything."""
        return {
            "index": any(e["id"] == pid for n in c.get("/api/numbers").json()
                         for e in n["entries"]),
            "list": any(x["id"] == pid for x in c.get("/api/posts").json()),
            "search": any(x["id"] == pid for x in
                          c.get("/api/posts", params={"q": "Kaprekar"}).json()),
            "one": c.get(f"/api/posts/{pid}").status_code == 200,
            "tags": any(t["tag"] == "kaprekar" for t in c.get("/api/tags").json()),
            "langs": any(x["lang"] == "Klingon" for x in c.get("/api/languages").json()),
            "related": any(r["id"] == pid for r in
                           c.get(f"/api/posts/{other['id']}").json()["related"]),
            "history": c.get(f"/api/posts/{pid}/revisions").status_code == 200,
            "talk": c.get(f"/api/posts/{pid}/comments").status_code == 200,
            "head": "Kaprekar" in c.get(f"/p/{pid}").text,
        }

    assert len(seen()) == 9 + 1, "nine reads, and search is the second on /api/posts"
    assert all(seen().values()), seen()

    admin.set_status(pid, "HIDDEN")
    assert not any(seen().values()), {k: v for k, v in seen().items() if v}

    # ...and it all comes back, because hiding changed one column and nothing else
    admin.set_status(pid, "ACTIVE")
    assert all(seen().values()), {k: v for k, v in seen().items() if not v}
    revs = c.get(f"/api/posts/{pid}/revisions").json()
    assert len(revs) == 2, "the translation and the edit, both still there"
    assert c.get(f"/api/posts/{pid}").json()["translations"][0]["lang"] == "Klingon"

    # DELETED is as invisible as HIDDEN. The two are kept apart for the operator
    # -- "taken down" against "removed on request" -- not for the reader.
    admin.set_status(pid, "DELETED")
    assert not any(seen().values()), {k: v for k, v in seen().items() if v}
    admin.set_status(pid, "HIDDEN")

    # a write cannot reach a hidden entry either: every one of them asks
    # fetch_one first, and the three that used to ask it afterwards now do not
    assert c.patch(f"/api/posts/{pid}", json={"title": "x"}).status_code == 404
    assert c.post(f"/api/posts/{pid}/like").status_code == 404
    assert c.delete(f"/api/posts/{pid}/like").status_code == 404
    assert c.post(f"/api/posts/{pid}/comments", json={"body": "hi"}).status_code == 404
    assert c.delete(f"/api/posts/{pid}/links/{other['id']}").status_code == 404
    assert c.post(f"/api/posts/{pid}/revisions/{revs[0]['id']}/restore"
                  ).status_code == 404
    assert c.get(f"/api/posts/{pid}").status_code == 404, "a failed write showed it"


def test_no_public_delete():
    """Removing an entry is not a stranger's button any more. The route is gone,
    so the path answers 405 rather than 404 -- GET and PATCH still live there,
    which is how a client can tell "not allowed" from "not found"."""
    c = TestClient(main.app)
    p = c.post("/api/posts", json={"value": "410", "title": "Gone"}).json()
    assert c.delete(f"/api/posts/{p['id']}").status_code == 405
    assert c.get(f"/api/posts/{p['id']}").status_code == 200, "and it is still there"
    admin.set_status(p["id"], "HIDDEN")


def test_likes_are_rate_limited():
    """Every write is limited; like and unlike were the two that were not, so a
    curl loop could farm a count and hammer the database for free. Lowered here
    rather than exercising 20 writes, and put back for the rest of the suite."""
    c = TestClient(main.app)
    a = c.post("/api/posts", json={"value": "7", "title": "Lucky"}).json()
    main._writes.clear()
    main.WRITE_LIMIT = 2
    try:
        assert c.post(f"/api/posts/{a['id']}/like").status_code == 200
        assert c.delete(f"/api/posts/{a['id']}/like").status_code == 200
        assert c.post(f"/api/posts/{a['id']}/like").status_code == 429
    finally:
        main.WRITE_LIMIT = 10_000
        main._writes.clear()


def test_comments():
    """A comment lands beside an entry and not in it: it takes no snapshot, so
    it is not an edit, and it is nowhere on the entry itself -- if it were on
    fetch_one it would ride into every revision taken afterwards. What it does
    share with the entry is the ending: the foreign key here cascades, which is
    the opposite of what the one on revisions deliberately does not do.
    """
    c = TestClient(main.app)
    p = c.post("/api/posts", json={"value": "451", "title": "Fahrenheit 451"}).json()
    pid = p["id"]

    first = c.post(f"/api/posts/{pid}/comments",
                   json={"body": "Paper burns at 451F, or so the title says.",
                         "author": "montag"})
    assert first.status_code == 201, first.text
    assert [x["author"] for x in first.json()] == ["montag"]

    # newest first, and the answer is the whole list, so the client needs no
    # second request to draw what it just wrote
    said = c.post(f"/api/posts/{pid}/comments", json={"body": "233C, really."}).json()
    assert [x["body"] for x in said] == [
        "233C, really.", "Paper burns at 451F, or so the title says."
    ]
    assert said[0]["author"] == "anonymous"   # nobody said who they were

    # the shape is checked the way a tag's is: blank is not a remark, and the
    # cap is the cap. COMMENT_MAX is read off main so the two cannot drift here.
    assert c.post(f"/api/posts/{pid}/comments", json={"body": "   "}).status_code == 422
    assert c.post(f"/api/posts/{pid}/comments",
                  json={"body": "x" * (main.COMMENT_MAX + 1)}).status_code == 422
    assert c.post(f"/api/posts/{pid}/comments",
                  json={"body": "x" * main.COMMENT_MAX}).status_code == 201
    assert c.post("/api/posts/999999/comments", json={"body": "hi"}).status_code == 404

    # said beside the entry, so: not on the entry, and not an edit to it
    assert "comments" not in c.get(f"/api/posts/{pid}").json()
    assert c.get(f"/api/posts/{pid}/revisions").json() == []

    # ...and not in the snapshot the next edit takes either
    c.patch(f"/api/posts/{pid}", json={"title": "Fahrenheit 451 (1953)",
                                       "author": "clarisse"})
    assert "comments" not in c.get(f"/api/posts/{pid}/revisions").json()[0]["snapshot"]

    # hiding the entry hides the talk with it and gives it all back: the row
    # stays, so the foreign key never fires
    admin.set_status(pid, "HIDDEN")
    assert c.get(f"/api/posts/{pid}/comments").status_code == 404
    admin.set_status(pid, "ACTIVE")
    assert len(c.get(f"/api/posts/{pid}/comments").json()) == 3

    # a purge is the other decision, and the one the cascade is for: the entry,
    # the talk beside it, and the snapshots no foreign key holds
    admin.purge(pid)
    assert c.get(f"/api/posts/{pid}").status_code == 404
    con = db.connect()
    try:
        left = {t: con.execute(
            f"SELECT COUNT(*) FROM {t} WHERE post_id = ?", (pid,)).fetchone()[0]
            for t in ("comments", "revisions", "translations", "post_tags")}
    finally:
        con.close()
    assert left == {"comments": 0, "revisions": 0, "translations": 0,
                    "post_tags": 0}, left


def test_upload_gc_keeps_what_history_points_at():
    """A picture is not orphaned just because no live entry shows it: a revision
    snapshot holds the path a restore hands back, a body can carry one in
    markdown, and a fresh upload may be sitting in a form nobody has saved yet.
    Only the last of the five below is really rubbish.
    """
    import time

    import gc_uploads

    c = TestClient(main.app)

    def put(name, days_old=0):
        path = os.path.join(main.UPLOAD_DIR, name)
        with open(path, "wb") as fh:
            fh.write(b"x" * 32)
        aged = time.time() - days_old * 86400
        os.utime(path, (aged, aged))
        return path

    shown, replaced, in_body, fresh, rubbish = (
        put("shown.png", 9), put("replaced.png", 9), put("inbody.png", 9),
        put("fresh.png"), put("rubbish.png", 9))

    p = c.post("/api/posts", json={"value": "8", "title": "with a picture",
                                   "image": "/uploads/replaced.png"}).json()
    c.patch(f"/api/posts/{p['id']}", json={"image": "/uploads/shown.png"})
    c.post("/api/posts", json={"value": "9", "title": "in the prose",
                               "body": "look at it: ![](/uploads/inbody.png)"})

    gc_uploads.sweep(delete=True)
    assert os.path.exists(shown), "the live entry's picture"
    assert os.path.exists(replaced), "a revision still hands this path back"
    assert os.path.exists(in_body), "referenced from a body, not from the column"
    assert os.path.exists(fresh), "may be in a form nobody has saved yet"
    assert not os.path.exists(rubbish), "nothing points at it and it is not new"


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
