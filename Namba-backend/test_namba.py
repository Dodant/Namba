"""Self-check: python test_namba.py   (no pytest, no fixtures)"""
import json
import os
import re
import string
import struct
import tempfile
import time
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree

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
import admin_api  # noqa: E402
import auth  # noqa: E402
import db  # noqa: E402
import events  # noqa: E402
import main  # noqa: E402
import seo  # noqa: E402
import seo_locale  # noqa: E402
import sqlite3  # noqa: E402
import store  # noqa: E402
from numfmt import FORMATS, bucket_of, grouped_value, is_abbr, parse_number  # noqa: E402

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
        # letters are the fifth kind, and the punctuation an abbreviation
        # carries inside it comes with them
        "UFO": ("ABBR", None),
        "ufo": ("ABBR", None),                 # the case is settled on write
        "CSI": ("ABBR", None),
        "R&D": ("ABBR", None),
        "Ph.D": ("ABBR", None),
        "X-ray": ("ABBR", None),
        "I/O": ("ABBR", None),                 # a slash is punctuation too
        "TL;DR": ("ABBR", None),               # and so is a semicolon
        "3M": ("MIXED", None),                 # a digit in it, so not a word
        "G7": ("MIXED", None),
        "유에프오": ("MIXED", None),              # another alphabet is not this one
        "УФО": ("MIXED", None),
    }
    for raw, want in cases.items():
        got = parse_number(raw)
        assert got == want, f"parse_number({raw!r}) = {got}, want {want}"

    # What may be *filed* as one, which is the looser question: parse_number
    # only ever guesses, and a poster picking ABBR is otherwise taken at their
    # word. Digits pass here and not above -- MP3 and Y2K are abbreviations
    # nothing can guess at -- but the alphabet is not negotiable.
    for ok in ("UFO", "ufo", "CSI", "R&D", "Ph.D", "X-ray", "I/O", "N/A", "km/h",
               "TL;DR", "MP3", "Y2K", "COVID-19", "3M", " UFO "):
        assert is_abbr(ok), ok
    for no in ("유에프오", "УФО", "宇宙", "café", "Ünicode", "42", "9.5", "9¾",
               "", "   ", "-", "...", "UF O", "UFO!"):
        assert not is_abbr(no), no


def test_the_two_apps_still_agree():
    """The hand-copied lists in `../Namba-frontend/src/api.ts` match these ones.

    The root CLAUDE.md calls these "kept in sync by hand" and says change one,
    change the other -- and until this test there was nothing checking that
    anybody had. The 422 the API answers only catches drift in one direction:
    a front end offering a reason the backend does not know fails loudly, while
    a backend that grows one the front end never lists just quietly drops a
    choice off a menu. Nobody sees an error; the option is simply not there.

    Parsed out of the TypeScript with a regex rather than by generating either
    side from the other. Codegen is what this repo declined -- being one repo so
    the pair can move in one commit *is* the design -- so the job here is to
    notice, not to enforce a source of truth.

    Missing file is a failure, not a skip: the two apps living in one checkout
    is the premise, and a check that quietly passes when it cannot look is the
    kind of test that is worse than none.
    """
    path = os.path.join(db.DIR, os.pardir, "Namba-frontend", "src", "api.ts")
    assert os.path.isfile(path), f"the other half of the repo is not at {path}"
    src = open(path, encoding="utf-8").read()

    def listed(name):
        """One `export const NAME = [...]` as Python.

        Every literal in these lists -- 'SPAM', 1, 24 * 7, null -- happens to be
        valid Python once null is None, so one reader does all eight rather than
        a parser per shape. eval with no builtins, over a file in this repo.
        """
        m = re.search(rf"export const {name}\b[^=]*=\s*\[(.*?)\]", src, re.S)
        assert m, f"{name} is not in api.ts at all"
        # `...'ABC'` is JavaScript spread and `*'ABC'` is Python unpacking, and
        # over a string they mean the same thing, so ABBR_BUCKETS reads with the
        # same eval as the other eight. None of these lists contains an
        # ellipsis in a literal, which is the only thing this would eat.
        body = (m.group(1).replace("null", "None").replace("...", "*")
                .strip().rstrip(","))
        return tuple(eval(f"[{body}]", {"__builtins__": {}}))  # noqa: S307

    def number(name):
        m = re.search(rf"export const {name}\b[^=]*=\s*(\d+)", src)
        assert m, f"{name} is not in api.ts at all"
        return int(m.group(1))

    # the five formats -- a format is a parser branch, it decides which of the
    # two sections a value is read in, and both sides have to agree on the word
    assert listed("FORMATS") == FORMATS, listed("FORMATS")
    # the five vocabularies the TEXT columns may hold, plus what the panel offers
    for name in ("DELETE_REASONS", "REPORT_REASONS", "POST_STATUSES",
                 "REQUEST_STATUSES", "REPORT_STATUSES", "BLOCK_TYPES",
                 "BLOCK_HOURS"):
        assert listed(name) == getattr(db, name), (name, listed(name))
    # the two tag limits
    assert number("TAG_MAX") == main.TAG_MAX
    assert number("TAGS_PER_POST") == main.TAGS_PER_POST

    # every reason on either side has words on it, or the picker shows a bare
    # SCREAMING_CASE token to a reader
    labels = set(re.findall(r"^  (\w+): '", src, re.M))
    for reason in set(db.DELETE_REASONS) | set(db.REPORT_REASONS):
        assert reason in labels, f"REASON_LABEL has nothing to say about {reason}"

    # The bands an index is cut into. Not a vocabulary either side stores, which
    # is why it was not in the table: `bucket_of` computes the label and the two
    # lists over there are what Home.tsx renders, one band per member, each
    # filtered by `n.bucket === b`. So a label this function can return and that
    # list does not carry is not a missing menu item -- it is entries that are
    # on the wiki and on no page. The other direction is a heading with nothing
    # under it, which is why this compares sets rather than one inclusion.
    #
    # The band's *words* need no check: `m.buckets` is keyed by `typeof
    # BUCKETS[number]`, so a label with no prose does not compile.
    integers = {bucket_of(k) for k in
                (0, 1, 9, 10, 99, 100, 999, 1000, 9999, 10000, 10 ** 9, -42)}
    assert integers == set(listed("BUCKETS")), (integers, listed("BUCKETS"))
    abbrs = {bucket_of(None, "ABBR", c) for c in
             string.ascii_uppercase + string.ascii_lowercase + string.digits}
    assert abbrs == set(listed("ABBR_BUCKETS")), (abbrs, listed("ABBR_BUCKETS"))
    # and only those two formats band at all, or a list would render one band
    # per row -- TIME sorts by minutes past midnight, where a magnitude means
    # nothing, and Decimal and Mixed sort by string and read as one list
    for fmt in ("TIME", "DECIMAL", "MIXED"):
        assert bucket_of(100, fmt) is None, fmt
    assert bucket_of(None, "ABBR", "...") is None, "no letter and no digit, no band"
    assert bucket_of(None, "ABBR", ".NET") == "N", "a band comes off the first letter"


def test_two_editors_do_not_undo_each_other():
    """A save from a copy that has since been edited is refused, not applied.

    This is the one way content disappears from a wiki whose whole premise is
    that nothing does. There is no delete route, `author` is never overwritten
    and every edit snapshots -- and none of that helps here, because the loss
    is a *write*: the edit form fills itself from the entry and then sends every
    field back, so a save is a read-modify-write with a person-sized gap in the
    middle. Two people who open the form a minute apart both hold a complete
    copy, and the second to save writes their copy of the fields they never
    touched over the first one's edit. Nothing errors. The wiki just quietly
    says what the loser of a race said.

    `base_updated_at` is the entry as the sender last saw it, which is what
    MediaWiki calls `basetimestamp`. Whole seconds, like every date in this
    database, so two saves inside one second still race -- what this catches is
    the gap that loses work rather than the gap that needs a thread scheduler.

    Optional, and that is the promise being kept rather than an omission: a
    write with no base behaves as it always did. This is an open API with no
    key, and forcing a two-step on `curl` would be charging everyone for a
    problem the form has.
    """
    c = TestClient(main.app)
    made = c.post("/api/posts", json={
        "value": "108", "title": "Beads on a mala", "author": "ananda",
        "body": "one for each bead", "tags": ["myth"],
    }).json()
    pid = made["id"]

    # Backdated so the two saves below cannot land in the same second, which is
    # the resolution of every date here and therefore of this check.
    opened_at = "2026-01-01T00:00:00+00:00"
    con = db.connect()
    with con:
        con.execute("UPDATE posts SET updated_at = ? WHERE id = ?", (opened_at, pid))
    con.close()

    # two people open /p/{id}/edit and both hold this
    opened = c.get(f"/api/posts/{pid}").json()
    assert opened["updated_at"] == opened_at
    form = {k: opened[k] for k in
            ("value", "format", "title", "body", "image", "lang", "grouped")}

    # the first one fixes the title
    first = c.patch(f"/api/posts/{pid}", json={
        **form, "title": "Beads on a japamala", "author": "sariputta",
        "base_updated_at": opened_at,
    })
    assert first.status_code == 200, first.text
    assert first.json()["title"] == "Beads on a japamala"

    revisions = len(c.get(f"/api/posts/{pid}/revisions").json())
    events_before = len(_events())

    # the second saves their own copy, minutes later, having only touched the
    # body -- but sending the title they read before the fix
    late = c.patch(f"/api/posts/{pid}", json={
        **form, "body": "one bead for each name", "author": "upali",
        "base_updated_at": opened_at,
    })
    assert late.status_code == 409, late.text

    now = c.get(f"/api/posts/{pid}").json()
    assert now["title"] == "Beads on a japamala", "the first edit was written back"
    assert now["body"] == "one for each bead", "the refused edit was applied anyway"
    assert now["edited_by"] == "sariputta"
    # a refused write leaves nothing: no snapshot of a state that never was, and
    # nothing in the log. The refusal happens inside the transaction that took
    # the snapshot, which is what rolls it back.
    assert len(c.get(f"/api/posts/{pid}/revisions").json()) == revisions
    assert len(_events()) == events_before
    assert c.get(f"/api/posts/{pid}").json()["tags"] == ["myth"], \
        "the refused write still rewrote the tags"

    # ...and the same save goes through once it is sent from what stands now
    fresh = c.get(f"/api/posts/{pid}").json()
    ok = c.patch(f"/api/posts/{pid}", json={
        **form, "title": fresh["title"], "body": "one bead for each name",
        "author": "upali", "base_updated_at": fresh["updated_at"],
    })
    assert ok.status_code == 200, ok.text
    assert ok.json() == {**ok.json(), "title": "Beads on a japamala",
                         "body": "one bead for each name"}

    # no base, no check -- an API client that never read the entry still writes
    blind = c.patch(f"/api/posts/{pid}", json={"body": "108 beads", "author": "kassapa"})
    assert blind.status_code == 200, blind.text
    assert blind.json()["body"] == "108 beads"


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
    # no picture of its own, so it falls back to the site's card -- which is
    # every entry here, none of them has one
    assert 'name="twitter:card" content="summary_large_image"' in page
    assert 'property="og:image" content="http://testserver/og.png"' in page
    assert 'property="og:image:alt"' in page, "the fallback card says what it reads"
    # the entry's own address, said once, so /p/12?anything is not a second page
    assert 'rel="canonical" href="http://testserver/p/%d"' % p["id"] in page
    assert 'property="article:published_time"' in page

    # An entry's picture is one of this wiki's uploads and nothing else. The
    # page draws `image` straight into an <img>, so an outside URL is a
    # tracking pixel every reader fetches -- the same argument that keeps link
    # unfurling out, from the reader's side of the wire -- and og_head would
    # build an og:image out of it that points nowhere. Refused on both writes;
    # a restore does not re-check, since a snapshot has to be restorable.
    for bad in ("https://tracker.test/pixel.gif", "//tracker.test/x.png",
                "/uploads/../secret.key", "/uploads/x.svg", "/uploads/x",
                "uploads/x.png", "/uploads/sub/x.png", "javascript:alert(1)"):
        r = c.patch(f"/api/posts/{p['id']}", json={"image": bad})
        assert r.status_code == 422, (bad, r.status_code, r.text)
        r = c.post("/api/posts", json={"value": "1729", "title": "x", "image": bad})
        assert r.status_code == 422, (bad, r.status_code, r.text)
    assert c.get(f"/api/posts/{p['id']}").json()["image"] is None, "a refusal wrote nothing"
    # ...and null still clears one: the form's Remove button rides on it
    assert c.patch(f"/api/posts/{p['id']}", json={"image": "/uploads/x.webp"}
                   ).json()["image"] == "/uploads/x.webp"
    assert c.patch(f"/api/posts/{p['id']}", json={"image": None}).json()["image"] is None

    # an entry with a picture uses its own, at an absolute url, and takes no
    # alt: nothing here has ever seen that image
    with_img = c.patch(f"/api/posts/{p['id']}", json={"image": "/uploads/x.png"}).json()
    page = c.get(f"/p/{with_img['id']}").text
    assert 'property="og:image" content="http://testserver/uploads/x.png"' in page
    assert "og.png" not in page, "its own picture, not the fallback"
    assert "og:image:alt" not in page

    # a title with a quote in it must not break out of the attribute
    ev = c.post("/api/posts", json={"value": "13", "title": 'the "unlucky" <one>'}).json()
    page = c.get(f"/p/{ev['id']}").text
    assert "<one>" not in page and "&lt;one&gt;" in page, "markup got through"

    # ...and a title with a backslash in it must not break the *regex*. This is
    # a different escape from the one above and html.escape does not do it: a
    # string replacement in re.sub reads \1 as a group reference, so this used
    # to raise `invalid group reference` and answer 500 for good. The body goes
    # through the same substitution, so it is checked here too.
    bs = c.post("/api/posts", json={
        "value": "512", "title": r"C:\1\2 backup", "body": r"the \g<0> folder",
    }).json()
    res = c.get(f"/p/{bs['id']}")
    assert res.status_code == 200, "a backslash in a title took the page down"
    assert r"C:\1\2 backup" in res.text and r"the \g&lt;0&gt; folder" in res.text

    # the entry's JSON-LD is what an answer engine reads it out of, and it has
    # to survive a title nobody would choose: "<" is escaped everywhere in it,
    # or "</script>" in an entry title ends the block for the HTML parser.
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>',
                        c.get(f"/p/{p['id']}").text, re.S)
    assert len(blocks) == 1, blocks
    art, crumb = json.loads(blocks[0])
    assert art["@type"] == "Article" and art["headline"] == "Taxicab number"
    assert art["author"]["name"] == "anonymous" and art["about"]["name"] == "1729"
    assert art["datePublished"] == p["created_at"], art["datePublished"]
    assert crumb["@type"] == "BreadcrumbList"
    assert [i["item"] for i in crumb["itemListElement"]] == [
        "http://testserver/", "http://testserver/n/1729",
        "http://testserver/p/%d" % p["id"]]

    # every asset is still an asset, and the api still answers first
    asset = c.get("/assets/app.js")
    assert asset.text == "console.log(1)"
    # the bundle's name carries its content hash, so this is the one place a
    # year is safe -- and the two files beside it that keep their names across
    # deploys must not get it, or a deploy is a stale app for everyone holding
    # the old one
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    for keeps_its_name in ("/", "/index.html"):
        assert "cache-control" not in c.get(keeps_its_name).headers, keeps_its_name
    assert c.get("/api/tags").status_code == 200
    assert c.get(f"/p/{p['id']}999").text.count("og:title") == 0, "unknown id got a card"
    # ...but a mistyped *endpoint* is not a page. The catch-all used to hand it
    # index.html with a 200, so a client asking the wrong /api path got HTML
    # where it expected JSON and res.ok said everything was fine.
    miss = c.get("/api/psots")
    assert miss.status_code == 404 and miss.json()["detail"] == "no such endpoint"
    assert c.get("/api").status_code == 404
    # ".." off the wire must not walk out of dist
    assert c.get("/../test.db").status_code in (200, 404) and "sqlite" not in c.get("/../test.db").text.lower()


def _ld(page):
    """Every JSON-LD block on a page, parsed."""
    return [json.loads(b) for b in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', page, re.S)]


def test_the_site_has_one_name():
    """index.html's <title> and App.tsx's SITE_TITLE are the same string.

    The English build default, client-side navigation title and localized SEO
    dictionary are separate because Python cannot import a TypeScript object.
    Assert all three, and every translated client title, so changing the name
    in one place cannot quietly leave a stale browser tab or search result.

    Same bargain as test_the_two_apps_still_agree: notice, do not enforce. Drift
    here is quiet -- the tab reads the old name after a navigation and is right
    again on reload -- which is exactly the kind nobody reports.
    """
    root = os.path.join(db.DIR, os.pardir, "Namba-frontend")
    page = open(os.path.join(root, "index.html"), encoding="utf-8").read()
    app = open(os.path.join(root, "src", "App.tsx"), encoding="utf-8").read()
    in_html = re.search(r"<title>(.*?)</title>", page, re.S)
    in_app = re.search(r"const SITE_TITLE = '(.*?)'", app)
    assert in_html, "index.html has no <title> -- og_head rewrites that tag by regex"
    assert in_app, "App.tsx has no SITE_TITLE"
    assert in_html.group(1) == in_app.group(1), (in_html.group(1), in_app.group(1))
    assert in_html.group(1) == seo_locale.words("en")["site_title"]
    # One file per locale under src/locales/, named by the same code this
    # dictionary is keyed on -- so a locale the front end dropped is a missing
    # file here rather than a title that quietly stopped being checked.
    for locale, text in seo_locale.TEXT.items():
        title = text["site_title"]
        path = os.path.join(root, "src", "locales", f"{locale}.ts")
        assert os.path.isfile(path), f"no {locale}.ts, but seo_locale still writes {locale}"
        words = open(path, encoding="utf-8").read()
        assert f"siteTitle: '{title}'" in words, (locale, title)


def test_every_locale_says_the_same_things():
    """`seo_locale.TEXT` has the guard the front end gets from its type system.

    `MESSAGES` over there is `Record<UiLocale, Messages>` with `Messages =
    typeof EN`, so a locale missing a line does not compile. Python has no such
    thing, and the two ways it goes wrong are both quiet: a *missing* key raises
    a KeyError deep in a <head> writer, and a translation that drops a
    `{placeholder}` renders a description with a hole in it, because
    `str.format` is happy to be handed a field it never uses.

    English is the shape the rest are measured against, the same as over there.
    """
    en = seo_locale.TEXT["en"]

    def fields(s):
        return {f for _, f, _, _ in string.Formatter().parse(s) if f}

    assert set(seo_locale.OG_LOCALES) == set(seo_locale.TEXT), \
        "a locale with prose but no Open Graph code is a KeyError in og_tags"
    assert seo.UI_LOCALES == set(seo_locale.TEXT), \
        "UI_LOCALES is derived from TEXT -- if this fails somebody spelled it again"

    for locale, text in seo_locale.TEXT.items():
        assert set(text) == set(en), (locale, sorted(set(en) ^ set(text)))
        for key, english in en.items():
            assert fields(text[key]) == fields(english), \
                (locale, key, sorted(fields(english)), sorted(fields(text[key])))


def test_localized_metadata():
    """Every server-rendered metadata channel follows the UI locale.

    The entry's own language is content and remains separate: a French UI does
    not turn a Korean article into French, even though its surrounding site
    description and share-card prose are French.
    """
    c = TestClient(main.app)
    # The header each locale is asked for, derived rather than listed: an
    # Open Graph code is already a language and a region, which is the shape
    # Accept-Language wants. Listed, this dict was a fourth copy of the locale
    # list, and a locale added to TEXT was simply never asked for here.
    for locale, og in seo_locale.OG_LOCALES.items():
        header = og.replace("_", "-")
        res = c.get("/", headers={"Accept-Language": header})
        page = res.text
        text = seo_locale.words(locale)
        assert res.headers["content-language"] == locale
        assert res.headers["vary"] == "Accept-Language, Cookie"
        assert f'<html lang="{locale}">' in page, (locale, page[:100])
        assert f"<title>{text['site_title']}</title>" in page, locale
        assert text["site_desc"] in page, locale
        assert (f'property="og:locale" content="{seo_locale.OG_LOCALES[locale]}"'
                in page), locale
        assert (page.count('property="og:locale:alternate"')
                == len(seo_locale.TEXT) - 1), locale
        assert text["image_alt"] in page, locale
        site, = _ld(page)[0]
        assert site["inLanguage"] == locale, (locale, site)

    post = c.post("/api/posts", json={
        "value": "7654321.5", "title": "Localized metadata entry",
        "grouped": True, "lang": "한국어", "tags": ["metadata-test"],
    }).json()

    number = c.get(
        "/n/7654321.5", headers={"Accept-Language": "de-DE"},
    ).text
    assert "<title>7.654.321,5 — 1 Eintrag · Namba</title>" in number
    assert "Was 7.654.321,5 bedeutet — 1 Eintrag auf Namba" in number
    collection, _ = _ld(number)[0]
    assert collection["inLanguage"] == "de"
    assert collection["isPartOf"]["inLanguage"] == "de"

    entry = c.get(
        f"/p/{post['id']}", headers={"Accept-Language": "fr-FR"},
    ).text
    assert "<title>7\u202f654\u202f321,5 — Localized metadata entry · Namba</title>" in entry
    assert ("Localized metadata entry — ce que signifie 7\u202f654\u202f321,5 sur Namba."
            in entry)
    article, _ = _ld(entry)[0]
    assert article["inLanguage"] == {"@type": "Language", "name": "한국어"}
    assert article["isPartOf"]["inLanguage"] == "fr"

    tagged = c.get(
        "/t/metadata-test", headers={"Accept-Language": "es-ES"},
    ).text
    assert "<title>metadata-test — 1 entrada · Namba</title>" in tagged
    assert "Números con la etiqueta metadata-test — 1 entrada en Namba" in tagged

    abbreviation = c.post("/api/posts", json={
        "value": "SEO", "format": "ABBR", "title": "Search engine optimization",
    }).json()
    abbr = c.get(
        "/a/SEO", headers={"Accept-Language": "ja-JP"},
    ).text
    assert "<title>SEO — 1件の項目 · Namba</title>" in abbr
    assert "SEOが表すもの — Nambaの1件の項目" in abbr

    guide = c.get("/guide", headers={"Accept-Language": "ko-KR"}).text
    assert "<title>항목 작성 지침 — Namba</title>" in guide
    assert seo_locale.words("ko")["guide_desc"] in guide
    crumb, = _ld(guide)[0]
    assert crumb["itemListElement"][-1]["name"] == "항목 작성 지침"

    noindex = c.get("/new", headers={"Accept-Language": "zh-CN"})
    assert noindex.headers["content-language"] == "zh-Hans"
    assert '<html lang="zh-Hans">' in noindex.text
    assert 'content="noindex, follow"' in noindex.text

    # The explicit UI cookie remains authoritative over Accept-Language for
    # every metadata field, not only for decimal punctuation.
    c.cookies.set("namba_ui_locale", "de")
    chosen = c.get("/", headers={"Accept-Language": "fr-FR"})
    assert chosen.headers["content-language"] == "de"
    assert "<title>Namba — ein Wiki über Zahlen</title>" in chosen.text
    assert 'property="og:locale" content="de_DE"' in chosen.text
    c.cookies.delete("namba_ui_locale")


def test_head_per_route():
    """Every page worth keeping arrives with a head of its own, and every page
    that is not worth keeping says so.

    Only /p/{id} used to get one. /n/42 -- the page this wiki exists to have --
    was byte-for-byte the front page as far as a crawler could tell, and so
    were /t/book and a mistyped path. None of it can be set from React: no
    crawler runs the JavaScript that would do it, which is why this is here and
    not there.
    """
    c = TestClient(main.app)
    a = c.post("/api/posts", json={
        "value": "808", "title": "Roland TR-808",
        "body": "The drum machine.", "tags": ["breakbeat"]}).json()
    c.post("/api/posts", json={
        # an ampersand, because the same string has to survive an HTML
        # attribute and a JSON string on the same page and they escape
        # differently
        "value": "808", "title": "808s & Heartbreak", "tags": ["breakbeat"]})

    # -- the front page: what the site is, and that it can be searched
    home = c.get("/").text
    assert "<title>Namba — a wiki of numbers</title>" in home, "site title lost"
    assert 'rel="canonical" href="http://testserver/"' in home
    assert "noindex" not in home
    site, = _ld(home)[0]
    assert site["@type"] == "WebSite" and site["url"] == "http://testserver/"
    assert site["potentialAction"]["target"]["urlTemplate"] == (
        "http://testserver/search?q={search_term_string}")
    # ?view=feed and ?format= re-sort one index; ?tag=book is /t/book already.
    # Four addresses for one page, and the canonical says which.
    for q in ("?view=feed", "?format=TIME", "?tag=breakbeat"):
        assert 'rel="canonical" href="http://testserver/"' in c.get("/" + q).text, q

    # -- /n/808 is about 808, and names what is filed under it
    page = c.get("/n/808").text
    assert "<title>808 — 2 entries · Namba</title>" in page, page[:400]
    assert ('name="description" content="What 808 means — 2 entries on Namba: '
            "Roland TR-808; 808s &amp; Heartbreak.\"") in page, page[:600]
    assert 'rel="canonical" href="http://testserver/n/808"' in page
    coll, crumb = _ld(page)[0]
    assert coll["@type"] == "CollectionPage" and coll["about"]["name"] == "808"
    assert coll["mainEntity"]["numberOfItems"] == 2
    # names, not just urls: this and the description are all a reader that does
    # not run the JavaScript ever learns about what is on this page
    assert [i["name"] for i in coll["mainEntity"]["itemListElement"]] == [
        "Roland TR-808", "808s & Heartbreak"]
    assert crumb["itemListElement"][-1]["item"] == "http://testserver/n/808"

    # -- a value with a slash in it. The router hands us a decoded path, where
    # "n/11%2F22%2F63" and a three-segment path are the same string, so this
    # reads the raw one. Get it wrong and the page 404s its own number.
    c.post("/api/posts", json={"value": "11/22/63", "title": "Stephen King"})
    page = c.get("/n/11%2F22%2F63").text
    assert "<title>11/22/63 — " in page, page[:400]
    assert "Stephen King" in _ld(page)[0][0]["mainEntity"]["itemListElement"][-1]["name"]
    assert 'href="http://testserver/n/11%2F22%2F63"' in page, "canonical re-encoded"
    # ...and one segment only. /n/42/anything is not a page the client has.
    assert "noindex" in c.get("/n/808/x").text

    # -- /a/{value} is the same page for the other section, in its own words.
    # An abbreviation is not a number, so it does not answer at /n/ and the
    # sentence under it does not say "means".
    c.post("/api/posts", json={"value": "UFO", "format": "ABBR",
                               "title": "Unidentified flying object"})
    page = c.get("/a/UFO").text
    assert "<title>UFO — 1 entry · Namba</title>" in page, page[:400]
    assert 'content="What UFO stands for — 1 entry on Namba: ' in page, page[:600]
    assert 'rel="canonical" href="http://testserver/a/UFO"' in page
    coll, crumb = _ld(page)[0]
    assert coll["about"]["name"] == "UFO"
    assert crumb["itemListElement"][-1]["item"] == "http://testserver/a/UFO"
    # a word has one spelling, so /a/ufo is the same page and says the stored
    # one -- in its title and its canonical, not just in its rows
    lower = c.get("/a/ufo").text
    assert "<title>UFO — 1 entry · Namba</title>" in lower, lower[:400]
    assert 'rel="canonical" href="http://testserver/a/UFO"' in lower
    # a slash in an abbreviation is the same raw-path trap as 11/22/63
    c.post("/api/posts", json={"value": "I/O", "format": "ABBR", "title": "input/output"})
    page = c.get("/a/I%2FO").text
    assert "<title>I/O — 1 entry · Namba</title>" in page, page[:400]
    assert 'rel="canonical" href="http://testserver/a/I%2FO"' in page, "canonical re-encoded"
    # a semicolon is a reserved character in a URL the same way, and TL;DR
    # is an abbreviation somebody will file
    c.post("/api/posts", json={"value": "TL;DR", "format": "ABBR", "title": "too long"})
    page = c.get("/a/TL%3BDR").text
    assert "<title>TL;DR — 1 entry · Namba</title>" in page, page[:400]
    assert 'rel="canonical" href="http://testserver/a/TL%3BDR"' in page, "canonical re-encoded"
    # ...and the two sections do not leak into each other
    assert "noindex" in c.get("/n/UFO").text, "an abbreviation answered at /n/"
    assert "Unidentified" not in c.get("/n/UFO").text

    # the same letters filed as a number on purpose -- which takes a poster
    # choosing Mixed for UFO -- is a second entry at a second address. One
    # each, and neither head names the other's, or the section condition is
    # only being carried by the fact that nothing was filed under both.
    c.post("/api/posts", json={"value": "UFO", "format": "MIXED",
                               "title": "a ratio somebody wrote UFO"})
    abbr, num = c.get("/a/UFO").text, c.get("/n/UFO").text
    assert "<title>UFO — 1 entry · Namba</title>" in abbr, abbr[:400]
    assert "a ratio" not in abbr, "the Mixed entry reached the abbreviation's page"
    assert "<title>UFO — 1 entry · Namba</title>" in num, num[:400]
    assert "Unidentified" not in num, "the abbreviation reached the number's page"

    # -- a tag page is the same shape, and folds case like tagLabel() does
    page = c.get("/t/BREAKBEAT").text
    assert "<title>breakbeat — 2 entries · Namba</title>" in page, page[:400]
    assert 'rel="canonical" href="http://testserver/t/breakbeat"' in page
    assert _ld(page)[0][0]["about"]["name"] == "breakbeat"

    # -- an empty number is a real page and not one to index: /n/ is an open
    # set, so indexing it means an unbounded number of blank pages in front of
    # the ones that say something.
    for empty in ("/n/999999999", "/t/nothingistaggedthis"):
        page = c.get(empty).text
        assert "noindex" in page, empty
        assert 'rel="canonical"' in page, empty
        # ...and still a card. noindex keeps it out of a search result; it says
        # nothing about the chat window someone pastes "be the first" into.
        assert 'property="og:image" content="http://testserver/og.png"' in page, empty

    # -- the entry itself is grouped as its own flag says
    grouped = c.post("/api/posts", json={
        "value": "1000", "title": "A grand", "grouped": True}).json()
    assert "<title>1,000 — A grand · Namba</title>" in c.get(f"/p/{grouped['id']}").text
    # the list page groups only when every entry filed under the number agrees,
    # which is the rule the hero draws by -- so whether 1000 reads as 1,000
    # here depends on the entries, and the *link* never does either way
    page = c.get("/n/1000").text
    assert 'href="http://testserver/n/1000"' in page, (
        "the link is built from the raw value, never the grouped one")
    assert "1%2C000" not in page and "/n/1,000" not in page

    # -- an entry with no body still gets a description of its own. Most of
    # this wiki is a title and nothing else, and the fallback used to name only
    # the number -- so every bodiless entry filed under 13 had the same one.
    bare = c.post("/api/posts", json={"value": "808", "title": "no body here"}).json()
    page = c.get(f"/p/{bare['id']}").text
    assert 'content="no body here — what 808 means, on Namba."' in page, page[:600]
    twin = c.post("/api/posts", json={"value": "808", "title": "nor here"}).json()
    assert 'content="nor here — what 808 means, on Namba."' in c.get(f"/p/{twin['id']}").text

    # -- an abbreviation's entry says what it stands for rather than what it
    # means, and the crumb above it points at the section it is read in. Both
    # come off the row's own format: hardcode either back to the number's and
    # the page still looks right, which is why they are asserted here.
    dna = c.post("/api/posts", json={"value": "DNA", "format": "ABBR",
                                     "title": "Deoxyribonucleic acid"}).json()
    page = c.get(f"/p/{dna['id']}").text
    assert 'content="Deoxyribonucleic acid — what DNA stands for, on Namba."' in page, \
        page[:600]
    article, crumb = _ld(page)[0]
    assert article["about"]["name"] == "DNA"
    assert [i["item"] for i in crumb["itemListElement"]] == [
        "http://testserver/", "http://testserver/a/DNA",
        f"http://testserver/p/{dna['id']}"], crumb
    admin.set_status(dna["id"], "HIDDEN")

    # -- and every one of them carries the site's card. An entry, a number, a
    # tag and the front page: four routes, no picture between them, and before
    # the fallback existed all four pasted into Slack as a bare grey box.
    for path in ("/", "/n/808", "/t/breakbeat", f"/p/{a['id']}"):
        page = c.get(path).text
        assert 'property="og:image" content="http://testserver/og.png"' in page, path
        assert 'name="twitter:card" content="summary_large_image"' in page, path

    # -- /guide is the second page here that is not a query, and the only
    # route besides the front page that seo.index_html() indexes on purpose. It
    # has to carry a title and a blurb of its own: head_home() would give it the
    # site's, and a search result for the rules would then be a duplicate of
    # the front page's.
    page = c.get("/guide").text
    assert "<title>Entry guidelines — Namba</title>" in page, page[:400]
    assert 'rel="canonical" href="http://testserver/guide"' in page
    assert "noindex" not in page, "the one page that says what a wiki keeps"
    assert "only counts its own sequels" in page, page[:800]
    assert "a wiki of numbers" not in page, "the site's own blurb, on the rules"
    crumb, = _ld(page)[0]
    assert [i["name"] for i in crumb["itemListElement"]] == [
        "Namba", "Entry guidelines"], crumb
    assert [i["item"] for i in crumb["itemListElement"]] == [
        "http://testserver/", "http://testserver/guide"], crumb
    assert 'property="og:image" content="http://testserver/og.png"' in page

    # -- and everything else stays out of an index. Three controls, one form,
    # an entry an operator took down, and a path that does not exist -- all of
    # which answer 200 with the app, and all of which used to answer with the
    # front page's head.
    for path in ("/search?q=x", "/random", "/new", f"/p/{a['id']}/edit",
                 f"/p/{a['id']}999", "/nope", "/n/", "/a/", "/t/"):
        assert 'content="noindex, follow"' in c.get(path).text, path
    # follow, not nofollow: /search and /new are full of links to entries that
    # should be crawled, and the page just should not be the one in the result.
    assert "nofollow" not in c.get("/search?q=x").text


def test_robots_and_sitemap():
    """A crawler can find the whole wiki, and is allowed to.

    Every link to /n/42 and /t/book is a <Link> the router draws after the
    JavaScript runs, and most crawlers -- every AI one -- do not run it. Before
    the sitemap this site was one page deep however much was written in it.
    """
    c = TestClient(main.app)
    p = c.post("/api/posts", json={
        "value": "23", "title": "Discordians", "tags": ["conspiracy"]}).json()
    gone = c.post("/api/posts", json={"value": "23", "title": "taken down"}).json()

    res = c.get("/robots.txt")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    assert "Sitemap: http://testserver/sitemap.xml" in res.text
    assert "Disallow: /admin" in res.text and "Disallow: /api/" in res.text
    # One group and no per-bot rule. Everything here is CC0 and the footer
    # invites anyone to feed it to a machine, so blocking the machines would
    # contradict the licence the site states on every page. If that changes it
    # changes in both places; these assertions check only the robots half.
    assert res.text.count("User-agent:") == 1
    for bot in ("GPTBot", "ClaudeBot", "PerplexityBot", "CCBot", "Google-Extended"):
        assert bot not in res.text, f"{bot} is blocked but the footer says CC0"

    res = c.get("/sitemap.xml")
    assert res.headers["content-type"].startswith("application/xml")
    root = ElementTree.fromstring(res.text)          # well-formed, or this raises
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    locs = [u.findtext(f"{ns}loc") for u in root.findall(f"{ns}url")]
    assert "http://testserver/" in locs
    # the rules page is reachable from the footer by a <Link> the router draws
    # after the JavaScript runs, which most crawlers do not -- so this file is
    # the only way in, the same as it is for every entry below it
    assert "http://testserver/guide" in locs
    assert f"http://testserver/p/{p['id']}" in locs
    assert "http://testserver/n/23" in locs
    assert "http://testserver/t/conspiracy" in locs
    assert len(locs) == len(set(locs)), "one address per page"
    # every entry carries the date it was last rewritten, which is the whole
    # point of asking a crawler back
    at = root.find(f"{ns}url/[{ns}loc='http://testserver/p/{p['id']}']").findtext(f"{ns}lastmod")
    assert at == c.get(f"/api/posts/{p['id']}").json()["updated_at"], at

    # a value that is not URL-safe has to come back out the way api.ts would
    # have built it, or the sitemap points at a page that is not there
    c.post("/api/posts", json={"value": "9¾", "title": "the platform"})
    locs = [u.findtext(f"{ns}loc") for u in
            ElementTree.fromstring(c.get("/sitemap.xml").text).findall(f"{ns}url")]
    assert "http://testserver/n/9%C2%BE" in locs, [x for x in locs if "9" in x]
    assert c.get("/n/9%C2%BE").text.count("<title>9¾ — 1 entry · Namba</title>") == 1

    # an abbreviation is listed at its own address and at no other. Grouped by
    # section as well as by value, or the one page a crawler can reach would be
    # the one it is not told about.
    ab = c.post("/api/posts", json={"value": "CSI", "format": "ABBR",
                                    "title": "Crime scene investigation"}).json()
    c.post("/api/posts", json={"value": "CSI", "format": "MIXED",
                               "title": "the same letters, filed as a number"})
    locs = [u.findtext(f"{ns}loc") for u in
            ElementTree.fromstring(c.get("/sitemap.xml").text).findall(f"{ns}url")]
    assert "http://testserver/a/CSI" in locs, [x for x in locs if "CSI" in x]
    assert "http://testserver/n/CSI" in locs, "the Mixed one has an address too"
    assert len(locs) == len(set(locs)), "one address per page"
    admin.set_status(ab["id"], "HIDDEN")
    locs = [u.findtext(f"{ns}loc") for u in
            ElementTree.fromstring(c.get("/sitemap.xml").text).findall(f"{ns}url")]
    assert "http://testserver/a/CSI" not in locs, "a hidden abbreviation was listed"

    # a hidden entry keeps its row and must not be handed to a crawler anyway
    admin.set_status(gone["id"], "HIDDEN")
    locs = ElementTree.fromstring(c.get("/sitemap.xml").text).findall(f"{ns}url")
    locs = [u.findtext(f"{ns}loc") for u in locs]
    assert f"http://testserver/p/{gone['id']}" not in locs
    assert "http://testserver/n/23" in locs, "the other entry under 23 is still up"


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


def _visitor(pid):
    """A client with a namba_cid of its own. Every TestClient reports the same
    address, so a second one is not a second person until it has loaded a page:
    the document is what sets the cookie the dedup keys on."""
    c = TestClient(main.app)
    c.get(f"/p/{pid}")
    assert events.COOKIE in c.cookies
    return c


def _operator(c, email="mod@namba.test", role="ADMIN"):
    """Sign in as an operator, creating one the only way there is to. Returns the
    client, which now carries the session cookie.

    The role is forced rather than passed to add_admin: only the *first* account
    is promoted automatically, and which test runs first is alphabetical."""
    try:
        admin.add_admin(email, "a long enough password")
    except ValueError:
        admin.set_active(email, True)
        admin.set_password(email, "a long enough password")
    con = db.connect()
    with con:
        con.execute("UPDATE admins SET role = ? WHERE email = ?", (role, email))
    con.close()
    got = _totp_login(c, email, "a long enough password")
    assert got.status_code == 200, got.text
    return c


def _enroll_totp(email):
    """Enroll the current test account without weakening the production path."""
    at = time.time()
    setup = admin.totp_enrollment(email)
    admin.enable_totp(
        email, setup["generation"],
        auth.totp_code(setup["admin_id"], setup["generation"], at=at),
    )
    return setup, at


def _totp_login(c, email, password):
    """A fresh enrollment makes rapid test logins use distinct counters."""
    setup, at = _enroll_totp(email)
    auth._attempts.clear()
    auth._mfa_attempts.clear()
    begun = c.post("/api/admin/login", json={"email": email, "password": password})
    if begun.status_code != 202:
        return begun
    code = auth.totp_code(
        setup["admin_id"], setup["generation"], at=at + auth.TOTP_STEP,
    )
    return c.post("/api/admin/login/totp",
                  json={"challenge": begun.json()["challenge"], "code": code})


def test_delete_requests():
    """Removing an entry is a request now, so the request has to be a real
    thing: a row with a reason, a queue, a decision, and an audit trail on both
    halves of it."""
    c = TestClient(main.app)
    p = c.post("/api/posts", json={"value": "31337", "title": "please remove me",
                                   "body": "0118 999 881 999 119 725 3"}).json()
    pid = p["id"]

    # the whole queue is behind the login
    assert TestClient(main.app).get("/api/admin/delete-requests").status_code == 401

    # the shape is checked the way a tag's is: an invented reason is a 422, not
    # a row nobody can filter on
    assert c.post(f"/api/posts/{pid}/delete-request",
                  json={"reason": "BECAUSE"}).status_code == 422
    assert c.post(f"/api/posts/{pid}/delete-request",
                  json={"reason": "SPAM", "detail": "x" * 1001}).status_code == 422
    assert c.post("/api/posts/999999/delete-request",
                  json={"reason": "SPAM"}).status_code == 404

    asked = c.post(f"/api/posts/{pid}/delete-request",
                   json={"reason": "OTHER", "detail": "that is a phone number",
                         "author": "moss"})
    assert asked.status_code == 201, asked.text
    req_id = asked.json()["id"]

    # one pending request per client, or a count stops counting people
    assert c.post(f"/api/posts/{pid}/delete-request",
                  json={"reason": "SPAM"}).status_code == 409

    # and asking changes nothing at all about the entry
    assert c.get(f"/api/posts/{pid}").status_code == 200

    ops = _operator(TestClient(main.app))
    queue = ops.get("/api/admin/delete-requests").json()
    mine = next(r for r in queue["rows"] if r["id"] == req_id)
    assert queue["total"] >= 1 and mine["status"] == "PENDING"
    assert mine["reason"] == "OTHER" and mine["requested_by"] == "moss"
    assert mine["title"] == "please remove me", "the queue does not say what it is about"
    assert mine["post_status"] == "ACTIVE"
    assert "testclient" not in str(mine), "the raw address reached the queue"

    # a rejection leaves the entry alone and says why
    bad = ops.post(f"/api/admin/delete-requests/{req_id}/decide",
                   json={"decision": "MAYBE"})
    assert bad.status_code == 422, bad.text
    done = ops.post(f"/api/admin/delete-requests/{req_id}/decide",
                    json={"decision": "REJECT", "note": "it is a joke, not a number"})
    assert done.json()["status"] == "REJECTED"
    assert c.get(f"/api/posts/{pid}").status_code == 200
    assert ops.post(f"/api/admin/delete-requests/{req_id}/decide",
                    json={"decision": "APPROVE"}).status_code == 409, \
        "a decided request was decided twice"

    # an approval hides the entry, and takes every other pending request on it
    # with it -- they were all asking for what just happened
    one, two = _visitor(pid), _visitor(pid)   # two people, so two pending requests
    a = one.post(f"/api/posts/{pid}/delete-request", json={"reason": "SPAM"}).json()
    b = two.post(f"/api/posts/{pid}/delete-request", json={"reason": "VANDALISM"}).json()
    assert a["id"] != b["id"], (a, b)
    ops.post(f"/api/admin/delete-requests/{a['id']}/decide",
             json={"decision": "APPROVE", "note": "yes, that is somebody's phone"})
    assert c.get(f"/api/posts/{pid}").status_code == 404, "the entry is still up"
    left = ops.get("/api/admin/delete-requests", params={"status": "ALL"}).json()["rows"]
    assert {r["status"] for r in left if r["post_id"] == pid} == {"APPROVED", "REJECTED"}
    assert next(r for r in left if r["id"] == b["id"])["decision_note"] \
        == f"decided with request {a['id']}"

    # ...reversibly. It is a column, so the entry is whole and so is its history.
    admin.set_status(pid, "ACTIVE")
    assert c.get(f"/api/posts/{pid}").json()["body"].startswith("0118")

    # both halves are audited, and the operator's half carries who
    kinds = {e["action"]: e for e in _events(target_id=pid)}
    assert kinds["CONTENT_DELETE"]["admin_id"], "the decision has no name on it"
    assert _events(action="DELETE_REQUEST"), "the asking was not recorded"
    assert _events(action="REQUEST_REJECT")[-1]["admin_id"]
    admin.set_status(pid, "HIDDEN")


def test_reports():
    """A report is counted per entry, because five people objecting to one entry
    is one thing for an operator to look at."""
    c = TestClient(main.app)
    p = c.post("/api/posts", json={"value": "8008", "title": "buy cheap watches"}).json()
    pid = p["id"]

    assert c.post(f"/api/posts/{pid}/report", json={"reason": "NONSENSE"}
                  ).status_code == 422
    # a report has no byline: it is addressed to the operator and read once
    assert c.post(f"/api/posts/{pid}/report",
                  json={"reason": "AD", "author": "sneak"}).status_code == 201
    assert c.post(f"/api/posts/{pid}/report", json={"reason": "SPAM"}
                  ).status_code == 409, "one client filed two open reports"

    others = [_visitor(pid) for _ in range(2)]
    for i, o in enumerate(others):
        got = o.post(f"/api/posts/{pid}/report",
                     json={"reason": "SPAM", "detail": f"seen it {i} times"})
        assert got.status_code == 201, got.text
    assert got.json()["open"] == 3, got.json()

    ops = _operator(TestClient(main.app))
    row = next(r for r in ops.get("/api/admin/reports").json()["rows"]
               if r["post_id"] == pid)
    assert row["reports"] == 3 and row["title"] == "buy cheap watches"
    assert set(row["reasons"].split(",")) == {"AD", "SPAM"}
    assert row["first_at"] <= row["last_at"]
    assert "sneak" not in str(row), "a report carried a byline"

    detail = ops.get(f"/api/admin/reports/{pid}/detail").json()
    assert len(detail) == 3 and all(len(d["ip_hash"]) == 64 for d in detail)
    assert len({d["ip_hash"] for d in detail}) >= 1

    # closing them is one decision on one entry, and it touches nothing else
    assert ops.post(f"/api/admin/reports/{pid}/decide",
                    json={"decision": "SHRUG"}).status_code == 422
    shut = ops.post(f"/api/admin/reports/{pid}/decide",
                    json={"decision": "RESOLVE", "note": "hidden and blocked"})
    assert shut.json() == {"post_id": pid, "status": "RESOLVED", "closed": 3}
    assert c.get(f"/api/posts/{pid}").status_code == 200, \
        "resolving a report changed the entry, which is four things in one button"
    assert ops.get("/api/admin/reports").json()["rows"] == [] or \
        pid not in [r["post_id"] for r in ops.get("/api/admin/reports").json()["rows"]]
    assert ops.post(f"/api/admin/reports/{pid}/decide",
                    json={"decision": "IGNORE"}).status_code == 404

    # ...and now the entry can be reported again, by the same people
    assert c.post(f"/api/posts/{pid}/report", json={"reason": "AD"}).status_code == 201
    assert _events(action="REPORT_RESOLVE")[-1]["admin_id"]
    admin.set_status(pid, "HIDDEN")


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

    # A write that wrote nothing leaves nothing. Both of these used to record
    # anyway: the unlink appended an UNLINK row for a link that was never
    # there, and the untranslate committed its snapshot before raising the 404,
    # so a 404 grew the edit history by one. `events` is append-only and
    # `revisions` is what a restore reaches for, so neither is a table to leave
    # a record of nothing in -- and the abuse view counts those event rows as
    # this client's writes.
    quiet = _events()[-1]["id"]
    revs_before = len(c.get(f"/api/posts/{pid}/revisions").json())
    assert c.delete(f"/api/posts/{pid}/links/{other['id']}").status_code == 200
    assert c.delete(f"/api/posts/{pid}/links/{other['id']}").status_code == 200
    assert c.delete(f"/api/posts/{pid}/translations/999999").status_code == 404
    assert len(c.get(f"/api/posts/{pid}/revisions").json()) == revs_before, \
        "a 404 left a revision behind"
    after = [r["action"] for r in _events() if r["id"] > quiet]
    assert after == ["UNLINK"], after

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
    assert oct(os.stat(events.SECRET_PATH).st_mode)[-3:] == "600", "world-readable"

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
    """Localized separators are a way of writing the number, never part of it."""
    assert grouped_value("1000", True) == "1,000"
    assert grouped_value("1000", False) == "1000"
    assert grouped_value("299792458", True) == "299,792,458"
    assert grouped_value("100", True) == "100", "no thousand to separate"
    assert grouped_value("1234.5678", True) == "1,234.5678", "only the whole part"
    assert grouped_value("1000.5", True, "de") == "1.000,5"
    assert grouped_value("1000.5", False, "de") == "1000,5"
    assert grouped_value("1000.5", True, "fr") == "1\u202f000,5"
    assert grouped_value("1000.5", False, "fr") == "1000,5"
    # nothing that is not a plain number is touched
    for odd in ("10:04PM", "11/22/63", "9\u00be", "80/20", "UFO"):
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

    # German and French UI punctuation reaches the same canonical value too.
    # The locale is input grammar only and never comes back as entry content.
    german = c.post("/api/posts", json={
        "value": "1.000,5", "number_locale": "de", "title": "de spelling",
    }).json()
    assert german["value"] == "1000.5" and german["grouped"] is True, german
    french = c.post("/api/posts", json={
        "value": "1\u202f000,5", "number_locale": "fr", "title": "fr spelling",
    }).json()
    assert french["value"] == "1000.5" and french["grouped"] is True, french
    ungrouped_de = c.post("/api/posts", json={
        "value": "1000,5", "number_locale": "de", "title": "decimal comma",
    }).json()
    assert ungrouped_de["value"] == "1000.5" and ungrouped_de["grouped"] is False

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
    de_page = c.get(
        f"/p/{german['id']}", headers={"Accept-Language": "de-DE,de;q=0.9"},
    )
    assert "<title>1.000,5 — de spelling · Namba</title>" in de_page.text
    assert de_page.headers["vary"] == "Accept-Language, Cookie"
    # An explicit UI choice wins over a browser default on a later refresh.
    c.cookies.set("namba_ui_locale", "fr")
    fr_page = c.get(
        f"/p/{french['id']}", headers={"Accept-Language": "de-DE"},
    ).text
    assert "<title>1\u202f000,5 — fr spelling · Namba</title>" in fr_page
    c.cookies.delete("namba_ui_locale")


def test_password_hashing():
    """stdlib scrypt, and the parameters travel inside the hash so that raising
    them later leaves every existing password working."""
    h = auth.hash_password("correct horse battery staple")
    assert h.startswith(f"scrypt${auth.N}${auth.R}${auth.P}$")
    assert auth.verify("correct horse battery staple", h)
    assert not auth.verify("correct horse battery stapl", h)
    assert "correct" not in h and "staple" not in h

    # salted, so the same password twice is not the same row
    assert h != auth.hash_password("correct horse battery staple")

    # a stored value this cannot parse is a no, never a 500 -- it is reached
    # with whatever is in the column, and the column is not always trustworthy
    for junk in ("", "$", "scrypt$x$8$1$aa$bb", "bcrypt$2$8$1$aa$bb", "aaaa"):
        assert auth.verify("anything", junk) is False, junk

    # and it reads its own parameters back rather than assuming today's
    cheap = auth.hash_password("x" * 12).replace(f"scrypt${auth.N}$", "scrypt$1024$")
    assert not auth.verify("x" * 12, cheap), "the stored cost was ignored"

    # RFC 6238's first SHA-1 vector. The RFC prints eight digits; the admin
    # login uses the conventional six over the same HOTP calculation.
    secret = b"12345678901234567890"
    assert auth.hotp(secret, 59 // 30, digits=8) == "94287082"


def test_admin_accounts():
    """The only login in the wiki. Readers still have none: there is no signup
    route to find, and the account this uses can only have come from a shell."""
    c = TestClient(main.app)
    email = "keeper@namba.test"
    admin.add_admin(email, "a long enough password")

    # A password is never sufficient, including during the migration from the
    # old account rows. Enrollment is a shell operation, not a public setup UI.
    not_ready = c.post("/api/admin/login",
                       json={"email": email, "password": "a long enough password"})
    assert not_ready.status_code == 403
    assert auth.SESSION_COOKIE not in c.cookies
    assert "totp-enroll" in not_ready.json()["detail"]

    def sign_in():
        """Five attempts a minute is the point of the limiter and a nuisance to a
        test that signs in six times, so the window is cleared rather than
        widened -- the limit itself is asserted at the end."""
        return _totp_login(c, email, "a long enough password")

    # nothing is gated by guesswork -- with no cookie it is 401, not an empty body
    assert c.get("/api/admin/me").status_code == 401

    # there is no route that makes an account, whatever it is called
    for path in ("/api/admin/signup", "/api/admin/register", "/api/admin/admins"):
        assert c.post(path, json={"email": "x@y.test", "password": "z" * 12}
                      ).status_code in (401, 404, 405), path

    assert c.post("/api/admin/login",
                  json={"email": email, "password": "wrong entirely"}
                  ).status_code == 401
    assert c.post("/api/admin/login",
                  json={"email": "nobody@namba.test", "password": "wrong entirely"}
                  ).json()["detail"] == "wrong email or password", \
        "the message told a stranger which addresses exist"

    # Password success creates an opaque, short-lived challenge and still no
    # session. A wrong code cannot exchange it; a valid unused counter can.
    setup, at = _enroll_totp(email)
    auth._attempts.clear()
    auth._mfa_attempts.clear()
    begun = c.post("/api/admin/login",
                   json={"email": email, "password": "a long enough password"})
    assert begun.status_code == 202, begun.text
    challenge = begun.json()["challenge"]
    assert auth.SESSION_COOKIE not in c.cookies
    con = db.connect()
    try:
        challenge_rows = [dict(r) for r in con.execute(
            "SELECT * FROM admin_login_challenges")]
    finally:
        con.close()
    assert challenge not in [r["token_hash"] for r in challenge_rows]
    assert challenge_rows[-1]["token_hash"] == auth._token_hash(challenge)
    assert c.post("/api/admin/login/totp",
                  json={"challenge": challenge, "code": "000000"}).status_code == 401
    code = auth.totp_code(setup["admin_id"], setup["generation"],
                          at=at + auth.TOTP_STEP)
    got = c.post("/api/admin/login/totp",
                 json={"challenge": challenge, "code": code})
    assert got.status_code == 200, got.text
    assert got.json()["role"] == "SUPER_ADMIN", "the first account has to be able " \
                                               "to create the second"
    assert c.get("/api/admin/me").json()["email"] == email

    # the cookie the browser cannot read, and the token the database does not hold
    token = c.cookies[auth.SESSION_COOKIE]
    jar = got.headers["set-cookie"]
    assert "httponly" in jar.lower() and "samesite=strict" in jar.lower(), jar
    con = db.connect()
    try:
        rows = [dict(r) for r in con.execute("SELECT * FROM admin_sessions")]
    finally:
        con.close()
    assert token not in [r["token_hash"] for r in rows], "the token is stored in clear"
    assert rows[-1]["token_hash"] == auth._token_hash(token)
    assert len(rows[-1]["ip_hash"]) == 64

    # signing in is an audit row like any other decision
    assert _events(action="ADMIN_LOGIN")[-1]["admin_id"] == c.get("/api/admin/me").json()["id"]

    # logging out kills the row, not just the browser's copy of it
    assert c.post("/api/admin/logout").status_code == 200
    assert c.get("/api/admin/me").status_code == 401
    c.cookies.set(auth.SESSION_COOKIE, token)
    assert c.get("/api/admin/me").status_code == 401, "the old token still worked"
    c.cookies.clear()

    # A TOTP counter is accepted once even if a fresh password challenge is
    # obtained while the six digits are still on screen.
    auth._attempts.clear()
    auth._mfa_attempts.clear()
    replay = c.post("/api/admin/login",
                    json={"email": email, "password": "a long enough password"})
    assert replay.status_code == 202
    assert c.post("/api/admin/login/totp",
                  json={"challenge": replay.json()["challenge"], "code": code}
                  ).status_code == 401
    assert c.get("/api/admin/me").status_code == 401

    # a revoked account loses its live sessions on the next request, which is
    # the whole reason this is a session table and not a signed token
    sign_in()
    assert c.get("/api/admin/me").status_code == 200
    admin.set_active(email, False)
    assert c.get("/api/admin/me").status_code == 401
    c.cookies.clear()
    assert sign_in().status_code == 401, "a revoked account could still sign in"

    # ...and the join is what does that, not the tidy-up beside it. set_active
    # deletes the live sessions too, which would hide a session lookup that had
    # stopped checking -- so this revokes the column alone and asks again.
    admin.set_active(email, True)
    sign_in()
    assert c.get("/api/admin/me").status_code == 200
    con = db.connect()
    with con:
        con.execute("UPDATE admins SET active = 0 WHERE email = ?", (email,))
    con.close()
    assert c.get("/api/admin/me").status_code == 401, \
        "the session lookup is not checking whether the account is still live"
    con = db.connect()
    with con:
        con.execute("UPDATE admins SET active = 1 WHERE email = ?", (email,))
    con.close()
    c.cookies.clear()

    # a password change does the same: a change that leaves the old cookie
    # working is not a change
    sign_in()
    assert c.get("/api/admin/me").status_code == 200
    admin.set_password(email, "an entirely different one")
    assert c.get("/api/admin/me").status_code == 401
    c.cookies.clear()

    # five attempts a minute, against the write limiter's twenty
    auth._attempts.clear()
    codes = [c.post("/api/admin/login", json={"email": email, "password": "no"}
                    ).status_code for _ in range(auth.LOGIN_LIMIT + 1)]
    assert codes[-1] == 429, codes
    auth._mfa_attempts.clear()

    # and the dict it counts in does not keep every address that ever knocked.
    # Nothing expired a *key* before this, only the timestamps inside one, so a
    # long-lived worker grew one entry per client for good. A live client keeps
    # its count across the sweep; a stale one is rebuilt if it ever comes back.
    #
    # The ceiling is lowered for the check rather than filled up to -- the same
    # move the suite makes with main.WRITE_LIMIT at the top of the file. Filling
    # to it would make this test allocate whatever the constant happens to say,
    # which is a thing somebody would raise one day and not think about.
    # Stale is an hour before now rather than the constant 1.0 that used to sit
    # here: monotonic() counts from boot, and a CI runner fresh from its image
    # read 56 seconds, which put 1.0 inside the sixty-second window and kept it.
    stale = time.monotonic() - 3600
    for mod in (auth, main):
        was, mod.KEEP_CLIENTS = mod.KEEP_CLIENTS, 2
        try:
            seen = auth._attempts if mod is auth else main._writes
            seen.clear()
            seen.update({f"stale{i}": [stale] for i in range(3)})
            if mod is auth:
                auth.limit_login("live")
            else:
                c.post("/api/posts", json={"value": "77", "title": "after a sweep"})
            assert len(seen) == 1, (mod.__name__, dict(seen))
        finally:
            mod.KEEP_CLIENTS = was
            (auth._attempts if mod is auth else main._writes).clear()

    # and the wide-open CORS cannot carry any of this: without credentials a
    # browser will not send the cookie cross-origin, which is the layer under
    # SameSite=Strict. Turning this on would undo both at once.
    cors = next(m for m in main.app.user_middleware
                if m.cls.__name__ == "CORSMiddleware")
    assert not cors.kwargs.get("allow_credentials"), \
        "allow_credentials would hand the admin session to any origin"

    # ...and the JSON content type is not a layer under SameSite for the admin
    # session either way: the preflight below is refused now (see
    # test_cross_site_writes_are_refused), and a refused preflight only stops a
    # browser. What protects the admin cookie is the two lines above.
    pre = c.options("/api/admin/posts/1/status", headers={
        "origin": "https://evil.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
    })
    assert pre.status_code == 400, pre.status_code

    admin.set_active(email, False)


def test_cross_site_writes_are_refused():
    """The API is readable from any origin and writable from this one.

    Every guard on the public half counts per IP hash, which assumes an
    attacker has few addresses. A page on another site that writes to this
    API through its visitors' browsers has every one of their addresses, and a
    block aimed at it lands on the visitors. Two layers close that, because
    a browser has two ways to send a cross-origin write:

    * a JSON body carries a content type that forces a preflight, and CORS
      answers a preflight for anything but a read with 400;
    * a body with no content type, or a multipart form, is a "simple request"
      and never preflights -- so `guard` refuses `Sec-Fetch-Site: cross-site`,
      which every current browser attaches and nothing else does.

    Neither touches a client that is not a browser: curl sends no
    Sec-Fetch-Site and does not preflight, which is what "open, no key" means.
    """
    c = TestClient(main.app)
    origin = {"origin": "https://evil.test"}

    # reads are open to every origin, preflighted or not
    pre = c.options("/api/posts", headers={**origin,
                                           "access-control-request-method": "GET"})
    assert pre.status_code == 200 and pre.headers["access-control-allow-origin"] == "*"
    got = c.get("/api/posts", headers=origin)
    assert got.status_code == 200 and got.headers["access-control-allow-origin"] == "*"

    # a preflight for a write is refused, whatever the route
    for method, path in (("POST", "/api/posts"), ("PATCH", "/api/posts/1"),
                         ("PUT", "/api/posts/1/translations"),
                         ("DELETE", "/api/posts/1/like"), ("POST", "/api/upload")):
        pre = c.options(path, headers={**origin, "access-control-request-method": method,
                                       "access-control-request-headers": "content-type"})
        # a browser fails the preflight on the status alone; the header says
        # which methods this API will ever grant an origin, and it is reads
        assert pre.status_code == 400, (method, path, pre.status_code)
        assert method not in pre.headers.get("access-control-allow-methods", ""), \
            (method, path, pre.headers.get("access-control-allow-methods"))

    # the simple-request path: a browser says where the request came from,
    # and a write from another site is refused before the limiter counts it
    body = {"value": "5", "title": "from somewhere else"}
    for site in ("cross-site",):
        r = c.post("/api/posts", json=body, headers={"sec-fetch-site": site})
        assert r.status_code == 403, (site, r.status_code, r.text)
    for site in ("same-origin", "same-site", "none"):
        r = c.post("/api/posts", json=body, headers={"sec-fetch-site": site})
        assert r.status_code == 201, (site, r.status_code, r.text)
    # ...and a client that says nothing -- curl, a script -- is still welcome
    assert c.post("/api/posts", json=body).status_code == 201
    # the refusal is the guard's, so it reaches every write the guard does
    up = c.post("/api/upload", files={"file": ("x.png", b"\x89PNG", "image/png")},
                headers={"sec-fetch-site": "cross-site"})
    assert up.status_code == 403, up.status_code
    assert c.get("/api/posts", headers={"sec-fetch-site": "cross-site"}).status_code == 200, \
        "reads are never refused; the wiki is open"


def test_admin_content_and_dashboard():
    """The operator's own reads: the one list in the codebase that shows hidden
    entries, the diff, and the counters over the top of them."""
    c = TestClient(main.app)
    ops = _operator(TestClient(main.app))

    # every one of them is behind the login
    cold = TestClient(main.app)
    for path in ("/api/admin/stats", "/api/admin/activity", "/api/admin/posts",
                 "/api/admin/posts/1", "/api/admin/posts/1/revisions",
                 "/api/admin/posts/1/diff?a=live", "/api/admin/abuse",
                 "/api/admin/admins"):
        assert cold.get(path).status_code == 401, path

    p = c.post("/api/posts", json={
        "value": "1969", "title": "Moon landing", "body": "One small step.\nTwo.",
        "tags": ["space"], "author": "armstrong"}).json()
    pid = p["id"]
    # the clock is stubbed a minute on, because "edited today" is
    # updated_at <> created_at and now() has second resolution: a create and an
    # edit inside one tick are indistinguishable, which is right in the column
    # and useless in a test
    later = (datetime.now(timezone.utc) + timedelta(minutes=1)
             ).isoformat(timespec="seconds")
    real, main.now = main.now, lambda: later
    try:
        c.patch(f"/api/posts/{pid}", json={
            "title": "Moon landings", "body": "One small step.\nTwo.\nAnd a third.",
            "value": "1970", "grouped": True, "tags": ["space", "history"],
            "author": "vandal"})
    finally:
        main.now = real
    assert ops.get("/api/admin/stats").json()["edited_today"] >= 1, \
        "an edit a minute after the create did not count as one"

    # the content table shows hidden entries, which is the point of it
    admin.set_status(pid, "HIDDEN")
    rows = ops.get("/api/admin/posts", params={"q": "Moon"}).json()
    mine = next(r for r in rows["rows"] if r["id"] == pid)
    assert mine["status"] == "HIDDEN" and mine["author"] == "armstrong"
    assert mine["edited_by"] == "vandal"
    assert mine["open_reports"] == 0 and mine["pending_requests"] == 0
    # the operator's search escapes LIKE's wildcards too -- same helper, and
    # this is the box an operator hunts a specific entry in
    assert ops.get("/api/admin/posts", params={"q": "_"}).json()["total"] == 0
    assert not any(r["id"] == pid for r in ops.get(
        "/api/admin/posts", params={"status": "ACTIVE"}).json()["rows"])
    assert ops.get("/api/admin/posts", params={"status": "NONSENSE"}
                   ).status_code == 422

    # ...and so does the detail read, using hidden=True like other admin handlers
    assert c.get(f"/api/posts/{pid}").status_code == 404
    full = ops.get(f"/api/admin/posts/{pid}").json()
    assert full["title"] == "Moon landings" and full["revision_count"] == 1
    assert full["reports"] == [] and full["requests"] == []
    admin.set_status(pid, "ACTIVE")

    # FLAGGED is a count and not a column: it moves when the reports do
    _visitor(pid).post(f"/api/posts/{pid}/report", json={"reason": "VANDALISM"})
    flagged = ops.get("/api/admin/posts", params={"flagged": "true"}).json()["rows"]
    assert pid in [r["id"] for r in flagged]
    assert next(r for r in flagged if r["id"] == pid)["open_reports"] == 1
    assert next(r for r in flagged if r["id"] == pid)["status"] == "ACTIVE", \
        "a report changed the entry's stored status"
    ops.post(f"/api/admin/reports/{pid}/decide", json={"decision": "IGNORE"})
    assert pid not in [r["id"] for r in ops.get(
        "/api/admin/posts", params={"flagged": "true"}).json()["rows"]], \
        "the badge outlived the report, which is why it is not a column"

    # every revision, numbered in reading order, with the action beside it and
    # without the snapshots
    revs = ops.get(f"/api/admin/posts/{pid}/revisions").json()
    assert [r["number"] for r in revs] == [1] and revs[0]["action"] == "EDIT"
    assert revs[0]["title"] == "Moon landing", "the snapshot's title, not today's"
    assert len(revs[0]["ip_hash"]) == 64
    assert "snapshot" not in revs[0], "fifty whole entries would come down the wire"

    # the diff answers fields and body apart, which is the readable way round
    d = ops.get(f"/api/admin/posts/{pid}/diff",
                params={"a": revs[0]["id"], "b": "live"}).json()
    changed = {f["name"]: (f["before"], f["after"]) for f in d["fields"]}
    assert changed["value"] == ("1969", "1970"), changed
    assert changed["title"] == ("Moon landing", "Moon landings")
    assert changed["grouped"] == (False, True)
    assert "body" not in changed, "a body change belongs in the body diff"
    assert "edited_by" not in changed, \
        "every edit changes edited_by, so a row for it says nothing"
    # ...and author is in the field list for the opposite reason: it must never
    # change, so a row for it turning up at all is the tripwire
    assert "author" in admin_api.DIFF_FIELDS, "the byline tripwire went missing"
    assert {"sign": "+", "text": "And a third."} in d["body"]
    assert d["tags"] == {"before": ["space"], "after": ["history", "space"]}
    assert ops.get(f"/api/admin/posts/{pid}/diff",
                   params={"a": "banana"}).status_code == 422
    assert ops.get(f"/api/admin/posts/{pid}/diff",
                   params={"a": "999999"}).status_code == 404

    # status is a route with an audit row, and the same route is the undo
    assert ops.post(f"/api/admin/posts/{pid}/status",
                    json={"status": "SHRUG"}).status_code == 422
    assert ops.post(f"/api/admin/posts/{pid}/status",
                    json={"status": "ACTIVE"}).status_code == 409, "already active"
    hid = ops.post(f"/api/admin/posts/{pid}/status",
                   json={"status": "HIDDEN", "note": "reverting a rewrite"})
    assert hid.json() == {"id": pid, "status": "HIDDEN", "was": "ACTIVE"}
    assert c.get(f"/api/posts/{pid}").status_code == 404
    assert _events(action="CONTENT_HIDE")[-1]["admin_id"]

    # an operator can revert a hidden entry, which the public route cannot reach
    assert c.post(f"/api/posts/{pid}/revisions/{revs[0]['id']}/restore"
                  ).status_code == 404
    # ...and reverting a *hidden* one has to work, or the operator is asked to
    # put the vandalism back on the wiki before they can undo it. snapshot()
    # reads through fetch_one, so hidden has to travel all the way down.
    reverted = ops.post(f"/api/admin/posts/{pid}/revisions/{revs[0]['id']}/restore",
                        json={"note": "the 1969 version was right"})
    assert reverted.status_code == 200, reverted.text
    back = reverted.json()
    assert back["value"] == "1969" and back["title"] == "Moon landing"
    assert back["author"] == "armstrong", "a revert took the byline"
    assert back["edited_by"] == "operator mod@namba.test"
    assert back["status"] == "HIDDEN", "a revert also un-hid it, which is two things"
    assert back["tags"] == ["space"]

    # ...and reverting added a revision rather than overwriting one
    after = ops.get(f"/api/admin/posts/{pid}/revisions").json()
    assert [r["number"] for r in after] == [2, 1]
    assert after[0]["title"] == "Moon landings", "the state it replaced"
    assert after[0]["action"] == "CONTENT_REVERT" and after[0]["by"] == "mod@namba.test"

    ops.post(f"/api/admin/posts/{pid}/status", json={"status": "ACTIVE"})

    # An operator can correct the number, and is the only one who can: the
    # wiki's own form keeps that field read-only, because /n/42 is a query on
    # this column and a stranger retyping it moves the entry to a page about
    # something else. The same edit is allowed here for the reason operators
    # exist at all -- it carries a name, a snapshot and a row in the log.
    assert TestClient(main.app).post(f"/api/admin/posts/{pid}/value",
                                     json={"value": "1971"}).status_code == 401
    ops.post(f"/api/admin/posts/{pid}/status", json={"status": "HIDDEN"})
    fixed = ops.post(f"/api/admin/posts/{pid}/value",
                     json={"value": "1,971", "note": "off by two"})
    assert fixed.status_code == 200, fixed.text
    fixed = fixed.json()
    # a separator never reaches the column, and typing one is still how the
    # display flag is asked for -- the same ungroup() the wiki's writes call
    assert fixed["value"] == "1971" and fixed["grouped"] is True
    assert fixed["format"] == "INTEGER" and fixed["sort_key"] == 1971.0
    assert fixed["author"] == "armstrong", "renumbering took the byline"
    assert fixed["edited_by"] == "operator mod@namba.test"
    assert fixed["status"] == "HIDDEN", \
        "a hidden entry is exactly the one whose number needs fixing"
    logged = _events(action="CONTENT_RENUMBER")[-1]
    assert logged["admin_id"] and json.loads(logged["meta"])["was"] == "1969"
    renumbered = ops.get(f"/api/admin/posts/{pid}/revisions").json()[0]
    assert renumbered["action"] == "CONTENT_RENUMBER"
    assert renumbered["value"] == "1969", \
        "the number it was is only recoverable because the snapshot came first"
    assert ops.post(f"/api/admin/posts/{pid}/value",
                    json={"value": "1971"}).status_code == 409
    assert ops.post(f"/api/admin/posts/{pid}/value",
                    json={"value": "1971", "format": "SHRUG"}).status_code == 422
    # ABBR is a claim about the value rather than a way of reading it, so it is
    # checked here too -- this route settles the format through resolve_format
    # for exactly that reason
    assert ops.post(f"/api/admin/posts/{pid}/value",
                    json={"value": "1971", "format": "ABBR"}).status_code == 422
    ops.post(f"/api/admin/posts/{pid}/value", json={"value": "1969"})
    ops.post(f"/api/admin/posts/{pid}/status", json={"status": "ACTIVE"})

    # the counters, and the two that must not double-count each other
    st = ops.get("/api/admin/stats").json()
    assert st["entries"] >= 1 and st["numbers"] >= 1
    assert st["numbers"] <= st["entries"], "more numbers than entries filed under them"
    assert st["created_today"] >= 1
    # ...and the two do not double-count: a create is not an edit
    fresh = c.post("/api/posts", json={"value": "70009", "title": "brand new"}).json()
    st2 = ops.get("/api/admin/stats").json()
    assert st2["created_today"] == st["created_today"] + 1
    assert st2["edited_today"] == st["edited_today"], "a create counted as an edit"
    admin.set_status(fresh["id"], "HIDDEN")
    assert st["edits_24h"] >= 1 and st["writes_1h"] >= 1
    assert set(st) == {"numbers", "entries", "hidden", "created_today",
                       "edited_today", "requests_pending", "reports_open",
                       "edits_24h", "writes_1h", "blocked", "comments"}, st

    # activity and the audit log are the same rows read two ways
    both = ops.get("/api/admin/activity").json()
    mine_only = ops.get("/api/admin/activity", params={"kind": "admin"}).json()
    anon = ops.get("/api/admin/activity", params={"kind": "anon"}).json()
    # Three kinds now, not two: a visitor wrote, an operator decided, or the
    # server fell over -- and the third has no admin_id either, so `anon` says
    # so rather than filing a 500 as a change somebody made to the wiki.
    con = db.connect()
    try:
        errors = con.execute(
            "SELECT COUNT(*) FROM events WHERE action = 'ERROR'").fetchone()[0]
    finally:
        con.close()
    assert both["total"] == mine_only["total"] + anon["total"] + errors
    assert all(r["admin_id"] and r["by"] for r in mine_only["rows"])
    assert all(r["admin_id"] is None and r["action"] != "ERROR"
               for r in anon["rows"])
    assert ops.get("/api/admin/activity", params={"kind": "sideways"}
                   ).status_code == 422
    assert any(r["title"] for r in both["rows"] if r["target_type"] == "post")

    # the abuse view counts; it does not pretend to detect
    ab = ops.get("/api/admin/abuse", params={"minutes": 60, "least": 1}).json()
    assert ab["clients"] and ab["clients"][0]["writes"] >= 1
    top = ab["clients"][0]
    assert len(top["ip_hash"]) == 64 and top["creates"] + top["edits"] >= 1
    assert top["first_at"] <= top["last_at"] and "duplicates" in ab

    # the same paragraph under three numbers is what an advert looks like here
    advert = "Buy cheap watches online at example.test, free shipping worldwide"
    for v in ("70001", "70002", "70003"):
        c.post("/api/posts", json={"value": v, "title": f"watches {v}",
                                   "body": advert})
    dupes = ops.get("/api/admin/abuse", params={"least": 1}).json()["duplicates"]
    ad = next(d for d in dupes if d["said"].startswith("Buy cheap watches"))
    assert ad["entries"] == 3 and ad["titles"] == 3, ad

    # ...and a shared *title* is not evidence at all. Keying this on the title
    # was the first version and it put five entries called "Time" at the top of
    # the real wiki, which is the wiki working. Nobody writes the same forty
    # words about two different numbers by coincidence; plenty of people write
    # the same short title.
    for v in ("70011", "70012", "70013"):
        c.post("/api/posts", json={"value": v, "title": "Innocently Shared Title",
                                   "body": f"a different thing about {v} entirely"})
    said = [d["said"] for d in
            ops.get("/api/admin/abuse", params={"least": 1}).json()["duplicates"]]
    assert not any("different thing" in x for x in said), said

    # ...and neither is a shared *absence* of one. Five entries with no body all
    # share the empty string, which scored as maximum repetition in the second
    # version of this query.
    for v in ("70021", "70022", "70023"):
        c.post("/api/posts", json={"value": v, "title": "Bare"})
    said = ops.get("/api/admin/abuse", params={"least": 1}).json()["duplicates"]
    assert all(len(d["said"].strip()) > 20 for d in said), said

    for v in ("70001", "70002", "70003", "70011", "70012", "70013",
              "70021", "70022", "70023"):
        for x in c.get("/api/posts", params={"value": v}).json():
            admin.set_status(x["id"], "HIDDEN")
    admin.set_status(pid, "HIDDEN")


def test_admin_accounts_from_the_panel():
    """A super admin can make the next operator, and cannot lock the door from
    the inside."""
    plain_email, super_email = "plain@namba.test", "chief@namba.test"
    ops = _operator(TestClient(main.app), super_email, "SUPER_ADMIN")
    assert ops.get("/api/admin/me").json()["role"] == "SUPER_ADMIN"

    assert ops.post("/api/admin/admins",
                    json={"email": "nope", "password": "z" * 12}).status_code == 422
    assert ops.post("/api/admin/admins",
                    json={"email": plain_email, "password": "short"}
                    ).status_code == 422, "a twelve character floor, checked"
    made = ops.post("/api/admin/admins",
                    json={"email": plain_email, "password": "a fine long password"})
    assert made.status_code == 201, made.text
    plain_id = made.json()["id"]
    assert ops.post("/api/admin/admins",
                    json={"email": plain_email, "password": "a fine long password"}
                    ).status_code == 409

    # ...and the account works, without being able to change the list
    lesser = TestClient(main.app)
    auth._attempts.clear()
    assert _totp_login(lesser, plain_email, "a fine long password").json()["role"] == "ADMIN"
    assert lesser.get("/api/admin/admins").status_code == 200, \
        "who else can act here is not a secret from the people who can act here"
    assert lesser.post("/api/admin/admins",
                       json={"email": "third@namba.test", "password": "z" * 12}
                       ).status_code == 403
    assert lesser.post(f"/api/admin/admins/{plain_id}/active",
                       json={"active": False}).status_code == 403

    # the one door that must not close from inside. It is also the only check
    # needed: require_super means whoever is asking is a live super admin, so
    # revoking anybody else always leaves at least them -- there is no reachable
    # way to take the last one out from in here, and a check for it would read
    # as protection and never fire.
    me = ops.get("/api/admin/me").json()["id"]
    second = ops.post("/api/admin/admins",
                      json={"email": "deputy@namba.test", "password": "z" * 14,
                            "role": "SUPER_ADMIN"}).json()
    assert ops.post(f"/api/admin/admins/{me}/active",
                    json={"active": False}).status_code == 409, \
        "revoked itself while another super admin was there to catch it"
    assert ops.post(f"/api/admin/admins/{second['id']}/active",
                    json={"active": False}).status_code == 200
    assert ops.post(f"/api/admin/admins/{me}/active",
                    json={"active": False}).status_code == 409, \
        "revoked itself as the last one standing"
    assert ops.get("/api/admin/me").status_code == 200, "and is still signed in"

    # revoking somebody else kills their live session on the next request
    assert lesser.get("/api/admin/me").status_code == 200
    assert ops.post(f"/api/admin/admins/{plain_id}/active",
                    json={"active": False}).json()["active"] is False
    assert lesser.get("/api/admin/me").status_code == 401
    assert ops.post("/api/admin/admins/999999/active",
                    json={"active": True}).status_code == 404
    assert _events(action="ADMIN_DEACTIVATE")[-1]["admin_id"] == me
    admin.set_active(super_email, False)


def test_blocking():
    """A block is on a browser, not a person, and it stops writing only. There
    is nothing to gain from stopping somebody reading an open wiki."""
    c = TestClient(main.app)
    p = c.post("/api/posts", json={"value": "666", "title": "the vandal was here"}).json()
    pid = p["id"]
    vandal = _visitor(pid)
    vandal.post(f"/api/posts/{pid}/comments", json={"body": "and again"})
    ops = _operator(TestClient(main.app))

    # the hashes come from the record of something they did, which is the only
    # place an operator can get one -- a block follows from having read the log
    ip = _events(action="COMMENT")[-1]
    assert ip["client_hash"], "the visitor never got a cookie"

    assert ops.post("/api/admin/blocks",
                    json={"type": "carrier-pigeon", "target_hash": ip["ip_hash"]}
                    ).status_code == 422
    made = ops.post("/api/admin/blocks",
                    json={"type": "ip", "target_hash": ip["ip_hash"],
                          "reason": "twelve entries in a minute", "hours": 24})
    assert made.status_code == 201, made.text
    bid = made.json()["id"]
    assert made.json()["expires_at"], "a 24 hour block has to end"

    # writing is refused, and told why
    stopped = vandal.post("/api/posts", json={"value": "667", "title": "again"})
    assert stopped.status_code == 403, stopped.text
    assert "twelve entries" in stopped.json()["detail"]
    assert "Reading is unaffected" in stopped.json()["detail"]
    for call in (lambda: vandal.patch(f"/api/posts/{pid}", json={"title": "x"}),
                 lambda: vandal.post(f"/api/posts/{pid}/comments", json={"body": "hi"}),
                 lambda: vandal.post(f"/api/posts/{pid}/like"),
                 lambda: vandal.post(f"/api/posts/{pid}/report", json={"reason": "SPAM"}),
                 lambda: vandal.post("/api/upload", files={
                     "file": ("x.png", b"\x89PNG", "image/png")})):
        assert call().status_code == 403, "a write got through the block"

    # ...and reading is untouched, all of it
    assert vandal.get(f"/api/posts/{pid}").status_code == 200
    assert vandal.get("/api/numbers").status_code == 200
    assert vandal.get(f"/p/{pid}").status_code == 200

    # the operator's own routes do not go through guard, so blocking your own
    # address does not lock you out of the panel
    assert ops.get("/api/admin/blocks").json()["total"] >= 1

    # lifting is an edit, not a delete: "we blocked this and let it back in" is
    # a thing to be able to read
    assert ops.post("/api/admin/blocks/999999/lift").status_code == 404
    assert ops.post(f"/api/admin/blocks/{bid}/lift").json()["lifted"] is True
    assert ops.post(f"/api/admin/blocks/{bid}/lift").status_code == 404, "lifted twice"
    assert vandal.post(f"/api/posts/{pid}/like").status_code == 200
    lifted = next(b for b in ops.get("/api/admin/blocks",
                                     params={"live": "false"}).json()["rows"]
                  if b["id"] == bid)
    assert lifted["lifted_at"] and lifted["live"] == 0
    assert lifted["by"] == "mod@namba.test", "the block does not say who made it"

    # an expired block does not bite either
    con = db.connect()
    with con:
        con.execute("""INSERT INTO blocks (type, target_hash, reason, created_at,
                           created_by, expires_at) VALUES (?,?,?,?,?,?)""",
                    ("ip", ip["ip_hash"], "yesterday", db.now(), 1,
                     "2020-01-01T00:00:00+00:00"))
    con.close()
    assert vandal.post(f"/api/posts/{pid}/like").status_code == 200, "expired and still biting"

    # a block on the cookie catches the same person on another address, and
    # leaves everybody else alone
    ops.post("/api/admin/blocks", json={"type": "client", "hours": 1,
                                        "target_hash": ip["client_hash"]})
    assert vandal.post(f"/api/posts/{pid}/like").status_code == 403
    assert _visitor(pid).post(f"/api/posts/{pid}/like").status_code == 200, \
        "a cookie block caught somebody else"

    # both halves are audited
    assert _events(action="CLIENT_BLOCK")[-1]["admin_id"]
    assert _events(action="CLIENT_UNBLOCK")[-1]["admin_id"]
    # and the hash is not spelled out in full in the log line
    assert len(json.loads(_events(action="CLIENT_BLOCK")[-1]["meta"])["target"]) == 8

    con = db.connect()
    with con:
        con.execute("UPDATE blocks SET lifted_at = ? WHERE lifted_at IS NULL",
                    (db.now(),))
    con.close()
    admin.set_status(pid, "HIDDEN")


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
    # an abbreviation is banded by its first letter or digit, off the value
    # and not the key it does not have: one band a letter to W, X-Z together,
    # and 0-9 last rather than first where ASCII would put it
    for value, want in [("UFO", "U"), ("ufo", "U"), ("X-ray", "X-Z"), ("Y2K", "X-Z"),
                        ("Zzz", "X-Z"), ("MP3", "M"), ("3M", "0-9"), (".NET", "N"),
                        ("COVID-19", "C"), ("", None)]:
        got = bucket_of(None, "ABBR", value)
        assert got == want, f"bucket_of(ABBR, {value!r}) = {got}, want {want}"
    assert bucket_of(42.0, "ABBR", "UFO") == "U", "the key had a say in a letter band"


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

    # -- the fifth kind. Letters are an abbreviation, they carry no sort key,
    # and a word has one spelling: the first writer's. A later "ufo" lands on
    # the "UFO" already here instead of opening a second page -- the same
    # argument the separators make -- and it is not folded to upper case,
    # because SaaS and IoT are abbreviations too and SAAS is not how anyone
    # writes them.
    u = c.post("/api/posts", json={"value": "UFO", "title": "Unidentified flying object",
                                   "author": "mulder"}).json()
    assert u["value"] == "UFO", u["value"]
    assert u["format"] == "ABBR" and u["sort_key"] is None and u["bucket"] == "U"
    again = c.post("/api/posts", json={"value": "ufo", "title": "the film"}).json()
    assert again["value"] == "UFO", again["value"]
    assert len(c.get("/api/posts", params={"value": "UFO"}).json()) == 2, \
        "the two spellings did not land on the same abbreviation"
    saas = c.post("/api/posts", json={"value": "SaaS", "title": "Software as a service"}).json()
    assert saas["value"] == "SaaS" and saas["format"] == "ABBR", saas
    saas2 = c.post("/api/posts", json={"value": "SAAS", "format": "ABBR", "title": "x"}).json()
    assert saas2["value"] == "SaaS", "a later writer did not adopt the spelling"
    assert len(c.get("/api/posts", params={"value": "saas", "section": "abbr"}).json()) == 2, \
        "the abbr section is not read case-insensitively"
    # the one entry about a word may still correct its own case: the lookup
    # leaves the entry being edited out, and nothing else here spells it
    iot = c.post("/api/posts", json={"value": "IOT", "format": "ABBR", "title": "x"}).json()
    assert c.patch(f"/api/posts/{iot['id']}", json={"value": "IoT", "author": "y"}
                   ).json()["value"] == "IoT"
    # a slash is punctuation an abbreviation carries, and the parser guesses it
    io = c.post("/api/posts", json={"value": "I/O", "title": "input/output"}).json()
    assert io["value"] == "I/O" and io["format"] == "ABBR", io
    # -- and this is the one format that is checked rather than taken at its
    # word. Every other one is a way of reading what was typed and cannot be
    # wrong about it; ABBR is a claim about the value, and with no login the
    # claim is a stranger's. Latin letters or it is not this section.
    for bad in ("유에프오", "УФО", "宇宙", "42", "9¾"):
        r = c.post("/api/posts", json={"value": bad, "title": "x", "format": "ABBR"})
        assert r.status_code == 422, (bad, r.status_code, r.text)
        assert "Latin letters" in r.text, r.text
        # ...and nothing of that value reached the section. Asked this way
        # rather than "no entry exists": 42 is already up here as an integer,
        # and what the refusal has to leave untouched is the other section.
        assert c.get("/api/posts",
                     params={"value": bad, "section": "abbr"}).json() == [], bad
    # the same value is fine as what it actually is
    assert c.post("/api/posts", json={"value": "유에프오", "title": "the letters, in Korean"}
                  ).json()["format"] == "MIXED"
    # digits are allowed even though the parser will never guess at them
    mp3 = c.post("/api/posts", json={"value": "mp3", "title": "MPEG-1 Audio Layer III",
                                     "format": "ABBR"}).json()
    assert mp3["value"] == "mp3" and mp3["format"] == "ABBR", mp3

    # a poster who means the letters as a number says so, and it is still a
    # different page -- one value, two sections, one address each
    mixed = c.post("/api/posts", json={"value": "UFO", "format": "MIXED",
                                       "title": "filed as a number on purpose"}).json()
    def section(name):
        return {x["id"] for x in c.get(
            "/api/posts", params={"value": "UFO", "section": name}).json()}
    assert section("abbr") == {u["id"], again["id"]}, section("abbr")
    assert section("number") == {mixed["id"]}, section("number")
    # ?format= is the narrower cut of the same column and had nothing on it
    assert {x["id"] for x in c.get(
        "/api/posts", params={"value": "UFO", "format": "abbr"}).json()
    } == {u["id"], again["id"]}, "?format= is not filtering, or not upper-casing"
    # an unknown section filters nothing rather than 422ing, the same way an
    # unknown sort falls back: a typo either side of the wire shows too much,
    # it does not break the page
    assert len(section("banana")) == 3

    # the format is what settles the spelling, so re-filing an entry adopts
    # the word's too -- the number field is read-only on an edit and sends no
    # value at all
    later = c.post("/api/posts", json={"value": "Ufo", "format": "MIXED",
                                       "title": "not sure yet"}).json()
    assert later["value"] == "Ufo", "MIXED keeps what was typed"
    fixed = c.patch(f"/api/posts/{later['id']}",
                    json={"format": "ABBR", "author": "scully"}).json()
    assert fixed["value"] == "UFO" and fixed["format"] == "ABBR", fixed
    assert fixed["author"] == later["author"], "re-filing took the byline over"
    assert fixed["edited_by"] == "scully"
    # re-filing an existing entry is the other way in, and the number field is
    # read-only on an edit -- so the value the check reads is the stored one.
    # The refusal happens inside the transaction that took the snapshot, so a
    # rejected edit leaves no revision behind either.
    ko = c.post("/api/posts", json={"value": "국정원", "title": "in Korean"}).json()
    before = len(c.get(f"/api/posts/{ko['id']}/revisions").json())
    r = c.patch(f"/api/posts/{ko['id']}", json={"format": "ABBR", "author": "x"})
    assert r.status_code == 422 and "Latin letters" in r.text, r.text
    assert c.get(f"/api/posts/{ko['id']}").json()["format"] == "MIXED"
    assert len(c.get(f"/api/posts/{ko['id']}/revisions").json()) == before, \
        "a refused edit left a snapshot behind"

    for pid in (u["id"], again["id"], mixed["id"], fixed["id"], mp3["id"], ko["id"],
                saas["id"], saas2["id"], iot["id"], io["id"]):
        admin.set_status(pid, "HIDDEN")

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

    # A tag of spaces is refused above, and so are the two fields that make the
    # page. min_length passes three spaces and the insert stores value.strip(),
    # so this used to be a 201 holding an empty title under an empty number:
    # a blank row on the index linking to /n/, which matches no route, on a
    # wiki where nothing takes an entry away again.
    for blank in ({"value": "  ", "title": "x"}, {"value": "1", "title": "   "}):
        assert c.post("/api/posts", json=blank).status_code == 422, blank
    # an edit cannot empty them either, and absent still means unchanged
    keep = c.post("/api/posts", json={"value": "606", "title": "kept"}).json()
    for blank in ({"title": " "}, {"value": "\t"}):
        assert c.patch(f"/api/posts/{keep['id']}", json=blank).status_code == 422, blank
    assert c.patch(f"/api/posts/{keep['id']}", json={"body": "b"}).status_code == 200
    assert c.get(f"/api/posts/{keep['id']}").json()["title"] == "kept"

    # A search is for the characters somebody typed, wildcards and all. "%" and
    # "_" are LIKE's own, so searching for "100%" used to match everything
    # beginning 100 and searching for "_" matched the entire wiki -- which on an
    # unlimited read is also the cheapest way to make the server work hard.
    c.post("/api/posts", json={"value": "990", "title": "battery at 100%"})
    c.post("/api/posts", json={"value": "991", "title": "battery at 1000 mAh"})
    hits = [h["title"] for h in c.get("/api/posts", params={"q": "100%"}).json()]
    assert hits == ["battery at 100%"], hits
    assert c.get("/api/posts", params={"q": "_"}).json() == []
    assert len(c.get("/api/posts", params={"q": "battery"}).json()) == 2

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

    # one language, one tab. A translation into the language the entry is
    # already written in is the entry twice, and so is the entry's own language
    # moving onto a tab that already exists -- 422 from both sides, and folded
    # for case the way the translations table itself is. The form has kept both
    # off its menus for longer; this is the half an open API can be told.
    dup = c.post("/api/posts", json={"value": "99", "title": "twice over",
                                     "lang": "English"}).json()
    assert c.put(f"/api/posts/{dup['id']}/translations",
                 json={"lang": "english", "title": "x"}).status_code == 422
    assert c.get(f"/api/posts/{dup['id']}").json()["translations"] == []
    assert c.get(f"/api/posts/{dup['id']}/revisions").json() == [], \
        "a refused write left a revision saying somebody replaced the entry"
    c.put(f"/api/posts/{dup['id']}/translations", json={"lang": "한국어", "title": "두 번"})
    assert c.patch(f"/api/posts/{dup['id']}", json={"lang": " 한국어 "}).status_code == 422
    assert c.get(f"/api/posts/{dup['id']}").json()["lang"] == "English", \
        "the entry moved onto its own translation's language anyway"
    # a language nothing is written in yet is still free
    assert c.patch(f"/api/posts/{dup['id']}", json={"lang": "Español"}).status_code == 200

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
    assert len(revs) == 1 and revs[0]["title"].startswith("The Hitch")
    assert revs[0]["author"] == "vogon"
    assert "snapshot" not in revs[0], "fifty whole entries would come down the wire"
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
    # said beside the entry and linked to another, so what a resurrection can
    # and cannot give back is on the record here rather than only in a comment
    c.post(f"/api/posts/{slash['id']}/comments", json={"body": "a Tuesday, in fact"})
    beside = c.post("/api/posts", json={"value": "11/23/63",
                                        "title": "the day after"}).json()
    c.post(f"/api/posts/{slash['id']}/links", json={"other_id": beside["id"]})
    # both really there first, or the two assertions after the restore pass by
    # asserting nothing
    assert len(c.get(f"/api/posts/{slash['id']}/comments").json()) == 1
    assert [r["id"] for r in
            c.get(f"/api/posts/{slash['id']}").json()["related"]] == [beside["id"]]
    con = db.connect()
    with con:
        con.execute("DELETE FROM posts WHERE id = ?", (slash["id"],))
    con.close()
    assert c.get(f"/api/posts/{slash['id']}").status_code == 404
    dead = c.get(f"/api/posts/{slash['id']}/revisions").json()[0]
    assert dead["title"] == "11/22/63"
    alive = c.post(f"/api/posts/{slash['id']}/revisions/{dead['id']}/restore",
                   json={"author": "arthur"}).json()
    assert alive["id"] == slash["id"] and alive["value"] == "11/22/63"
    assert alive["author"] == slash["author"], "the original writer was lost"
    assert alive["edited_by"] == "arthur"
    assert alive["tags"] == ["book"], "the tags cascaded away and were not rebuilt"
    assert c.get(f"/api/posts/{slash['id']}").status_code == 200

    # The entry, its tags and its translations come back because a snapshot is
    # what fetch_one shapes. The talk and the links do not and cannot: neither
    # is in there -- a comment is not part of the entry, which is why it is not
    # on fetch_one -- and both tables cascade on posts(id), so the delete took
    # them. A recovery that looks whole and is not is worth an assertion.
    assert c.get(f"/api/posts/{slash['id']}/comments").json() == [], \
        "the talk came back from a snapshot that never held it"
    assert c.get(f"/api/posts/{slash['id']}").json()["related"] == [], \
        "the links came back from a snapshot that never held them"

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

    # Text is stored in one Unicode normal form. macOS hands over Korean typed
    # in some apps, and every file name, as decomposed jamo; the same word in
    # composed form is a different string to SQLite, so without this "한국어"
    # was two tags, two languages and a search that missed. Every string a
    # write takes -- tags, values, titles, bodies, languages, nicknames -- and
    # every query parameter a read filters on goes through the same fold.
    import unicodedata
    nfc, nfd = "한국어", unicodedata.normalize("NFD", "한국어")
    assert nfc != nfd, "the test needs two spellings to start from"
    ko1 = c.post("/api/posts", json={"value": "3", "title": "세", "tags": [nfc]}).json()
    ko2 = c.post("/api/posts", json={"value": "4", "title": unicodedata.normalize("NFD", "네"),
                                     "tags": [nfd]}).json()
    assert ko2["title"] == "네" and unicodedata.is_normalized("NFC", ko2["title"]), ko2["title"]
    korean = [t for t in c.get("/api/tags").json()
              if unicodedata.normalize("NFC", t["tag"]) == nfc]
    assert korean == [{"tag": nfc, "count": 2}], korean
    assert len(c.get("/api/posts", params={"tag": nfd}).json()) == 2, "a decomposed filter"
    assert len(c.get("/api/posts", params={"q": unicodedata.normalize("NFD", "네")}).json()) >= 1, \
        "a decomposed search misses a composed title"
    def korean_rows():
        return [l for l in c.get("/api/languages").json()
                if unicodedata.normalize("NFC", l["lang"]) == nfc]
    before = sum(l["count"] for l in korean_rows())
    c.put(f"/api/posts/{ko1['id']}/translations", json={"lang": nfc, "title": "k"})
    c.put(f"/api/posts/{ko2['id']}/translations", json={"lang": nfd, "title": "k"})
    assert korean_rows() == [{"lang": nfc, "count": before + 2}], korean_rows()
    # a value too: /n/ is a query on the column, and two spellings are two pages
    v = c.post("/api/posts", json={"value": unicodedata.normalize("NFD", "1960년"),
                                   "title": "x"}).json()
    assert v["value"] == "1960년" and unicodedata.is_normalized("NFC", v["value"])
    assert len(c.get("/api/posts", params={"value": unicodedata.normalize("NFD", "1960년"),
                                           "section": "number"}).json()) == 1
    # rows written before the rule are folded once, at startup, the way the
    # lower-case tag rule reached its own past -- and a post carrying the word
    # both ways keeps one row, since (post_id, tag) is the primary key
    con = db.connect()
    with con:
        con.execute("INSERT INTO post_tags (post_id, tag) VALUES (?, ?)", (ko1["id"], nfd))
        con.execute("UPDATE posts SET title = ? WHERE id = ?",
                    (unicodedata.normalize("NFD", "네"), ko2["id"]))
    con.close()
    db.init()
    con = db.connect()
    assert [r[0] for r in con.execute("SELECT tag FROM post_tags WHERE post_id = ?",
                                      (ko1["id"],))] == [nfc]
    assert con.execute("SELECT title FROM posts WHERE id = ?", (ko2["id"],)).fetchone()[0] == "네"
    con.close()


def test_hidden_is_invisible():
    """Hiding an entry takes it off the wiki, not out of one view of it.

    Thirteen public reads carry the status condition and missing one leaks the
    body of something an operator took down, so this walks all thirteen: the
    index, the list endpoint the feed and the search share, the entry itself,
    the two vocabularies, its row among another entry's related entries, its
    history, the talk beside it, the <head> written server-side for /p/{id},
    the three written for the list pages it appears on, and the sitemap handed
    to crawlers.

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
    # the other section, so that /a/{value} is walked too. No tag, no
    # translation and a value of its own: anything it shared with the entry
    # above would keep that row's read alive and the assertion would pass
    # without the condition doing anything.
    ab = c.post("/api/posts", json={"value": "KAP", "format": "ABBR",
                                    "title": "Kaprekar, for short"}).json()
    c.put(f"/api/posts/{pid}/translations",
          json={"lang": "Klingon", "title": "loSmaH", "body": "loS", "author": "worf"})
    c.post(f"/api/posts/{pid}/comments", json={"body": "It really is every time."})
    c.post(f"/api/posts/{pid}/links", json={"other_id": other["id"]})
    c.patch(f"/api/posts/{pid}", json={"title": "Kaprekar constant", "author": "d.r."})

    def move(status):
        """Both entries at once. They are hidden together so that a read which
        forgot LIVE has nowhere to keep the word alive from."""
        admin.set_status(pid, status)
        admin.set_status(ab["id"], status)

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
            # the list pages name their entries in the description and in the
            # JSON-LD ItemList, which is a copy of the title outside the app
            "n-head": "Kaprekar" in c.get("/n/6174").text,
            "a-head": "Kaprekar" in c.get("/a/KAP").text,
            "t-head": "Kaprekar" in c.get("/t/kaprekar").text,
            # and the sitemap is a list of every address a crawler should ask
            # for -- a hidden entry's is not one of them
            "sitemap": f"/p/{pid}</loc>" in c.get("/sitemap.xml").text,
        }

    assert len(seen()) == 13 + 1, "thirteen reads, and search is the second on /api/posts"
    assert all(seen().values()), seen()

    move("HIDDEN")
    assert not any(seen().values()), {k: v for k, v in seen().items() if v}

    # ...and it all comes back, because hiding changed one column and nothing else
    move("ACTIVE")
    assert all(seen().values()), {k: v for k, v in seen().items() if not v}
    revs = c.get(f"/api/posts/{pid}/revisions").json()
    assert len(revs) == 2, "the translation and the edit, both still there"
    assert c.get(f"/api/posts/{pid}").json()["translations"][0]["lang"] == "Klingon"

    # DELETED is as invisible as HIDDEN. The two are kept apart for the operator
    # -- "taken down" against "removed on request" -- not for the reader.
    move("DELETED")
    assert not any(seen().values()), {k: v for k, v in seen().items() if v}
    move("HIDDEN")

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

    # ...and not in the snapshot the next edit takes either. Read out of the
    # column rather than off the wire, because the wire no longer carries a
    # snapshot at all -- and it is the stored one that a restore reads back.
    c.patch(f"/api/posts/{pid}", json={"title": "Fahrenheit 451 (1953)",
                                       "author": "clarisse"})
    rev_id = c.get(f"/api/posts/{pid}/revisions").json()[0]["id"]
    con = db.connect()
    stored = json.loads(con.execute("SELECT snapshot FROM revisions WHERE id = ?",
                                    (rev_id,)).fetchone()["snapshot"])
    con.close()
    assert "comments" not in stored

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


def test_purge_takes_the_words_that_asked_for_it():
    """A removal request restates what it wants removed -- the number, the
    address, the name -- so `purge` blanks the two free-text columns and keeps
    their rows. The row is the record that somebody asked and an operator
    agreed, which is why the schema leaves the foreign key off in the first
    place; the prose is the thing the purge was for.

    The sweep at the end is the assertion worth having. `detail` is the only
    place either sentence lives -- both write routes hand `reason` to events and
    never this -- so a copy turning up in any column of any table is a purge
    that stopped short, and this notices without being told where to look.
    """
    c = TestClient(main.app)
    pid = c.post("/api/posts",
                 json={"value": "0117", "title": "A telephone number"}).json()["id"]

    asked = "take this down, 0117-33-5-244 is my house"
    said = "that is my address in the body, flat four Lammermoor Terrace"
    assert c.post(f"/api/posts/{pid}/delete-request",
                  json={"reason": "OTHER", "detail": asked,
                        "author": "thom"}).status_code == 201
    assert c.post(f"/api/posts/{pid}/report",
                  json={"reason": "ABUSE", "detail": said}).status_code == 201

    admin.purge(pid)

    con = db.connect()
    try:
        req = con.execute("SELECT * FROM delete_requests WHERE post_id = ?",
                          (pid,)).fetchone()
        rep = con.execute("SELECT * FROM reports WHERE post_id = ?",
                          (pid,)).fetchone()
        assert req is not None and rep is not None, "both rows outlive the entry"
        assert (req["detail"], rep["detail"]) == ("", ""), \
            (req["detail"], rep["detail"])

        # what is left is still a decision to read: who asked, for what reason,
        # about which entry, and where it stood when the entry went
        assert (req["post_id"], req["reason"], req["requested_by"],
                req["status"]) == (pid, "OTHER", "thom", "PENDING")
        assert (rep["post_id"], rep["reason"], rep["status"]) == (pid, "ABUSE", "OPEN")

        tables = [r["name"] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'")]
        for table in tables:
            for row in con.execute(f"SELECT * FROM {table}"):
                for col, val in dict(row).items():
                    for needle in (asked, said):
                        assert needle not in str(val), (table, col, needle)
    finally:
        con.close()


def test_every_write_decides_inside_the_lock():
    """One rule for all twelve public writes: the read a route decides on runs
    with the write lock already held.

    The rule needs stating because `with con:` is not it. Python's sqlite3 in
    legacy isolation mode issues its BEGIN before the first *write*, so a SELECT
    earlier in the block holds nothing -- and in WAL that never fails, it just
    answers about the database as it was. `db.writing` takes the lock up front.

    Probed rather than reasoned about, and probed from *outside*: at the moment
    of the deciding read a second connection tries to take the write lock with
    no timeout, and being refused is the whole assertion. `con.in_transaction`
    cannot say this -- it is true of a deferred transaction as well, which is
    the transaction that holds nothing. Only another writer being turned away
    proves the lock is there.

    The *first* probed call in each request is that route's deciding read. A
    later `fetch_one` runs after the commit to build the response, which is why
    it is the first call that is checked and not all of them.
    """
    seen, log = set(), []

    def held():
        """Whether somebody is holding the write lock at this instant."""
        spy = sqlite3.connect(db.DB_PATH, timeout=0)
        try:
            spy.execute("BEGIN IMMEDIATE")
            spy.rollback()
            return False
        except sqlite3.OperationalError:
            return True
        finally:
            spy.close()

    def watch(name, fn):
        def probe(*a, **k):
            seen.add(name)
            log.append((name, held()))
            return fn(*a, **k)
        return probe

    where = [(main, "fetch_one"), (store, "fetch_one"), (main, "resolve_format"),
             (main, "_already_open"), (main, "guard_public")]
    real = [(mod, name, getattr(mod, name)) for mod, name in where]
    for mod, name in where:
        setattr(mod, name, watch(name, dict((n, f) for _, n, f in real)[name]))

    c = TestClient(main.app)
    try:
        def locked(what, call):
            """Run one write and report where its first deciding read ran."""
            log.clear()
            res = call()
            assert log, f"{what} decided on nothing -- the probe saw no read"
            assert log[0][1] is True, (what, log[:3])
            return res

        a = locked("create", lambda: c.post("/api/posts", json={
            "value": "1123", "title": "A fig tree", "tags": ["plants"]}).json())
        b = locked("create", lambda: c.post("/api/posts", json={
            "value": "1124", "title": "The one beside it"}).json())
        pid, other = a["id"], b["id"]

        locked("edit", lambda: c.patch(f"/api/posts/{pid}",
                                      json={"body": "figs", "author": "hesse"}))
        locked("translate", lambda: c.put(f"/api/posts/{pid}/translations", json={
            "lang": "Korean", "title": "무화과", "body": "나무"}))
        tr = c.get(f"/api/posts/{pid}").json()["translations"][0]["id"]
        locked("untranslate",
               lambda: c.delete(f"/api/posts/{pid}/translations/{tr}"))
        locked("like", lambda: c.post(f"/api/posts/{pid}/like"))
        locked("unlike", lambda: c.delete(f"/api/posts/{pid}/like"))
        locked("comment", lambda: c.post(f"/api/posts/{pid}/comments",
                                        json={"body": "it is a fig"}))
        locked("link", lambda: c.post(f"/api/posts/{pid}/links",
                                     json={"other_id": other}))
        locked("unlink", lambda: c.delete(f"/api/posts/{pid}/links/{other}"))
        locked("delete-request", lambda: c.post(
            f"/api/posts/{pid}/delete-request", json={"reason": "OTHER"}))
        locked("report", lambda: c.post(f"/api/posts/{pid}/report",
                                       json={"reason": "SPAM"}))
        rev = c.get(f"/api/posts/{pid}/revisions").json()[0]["id"]
        locked("restore", lambda: c.post(
            f"/api/posts/{pid}/revisions/{rev}/restore", json={"author": "hesse"}))
    finally:
        for mod, name, fn in real:
            setattr(mod, name, fn)

    # ...and the probe reached every kind of deciding read there is, so none of
    # the twelve passed by touching nothing
    assert seen == {"fetch_one", "resolve_format", "_already_open",
                    "guard_public"}, seen


def test_linking_a_pair_twice_is_one_event():
    """`INSERT OR IGNORE` makes a second Link on the same pair a no-op, and an
    append-only log must not carry a row for a no-op.

    `remove_link`'s comment named this asymmetry from the other side -- "the
    sibling routes here already guard on rowcount; this one did not" -- and by
    then it was `add_link` that did not. It counts: /api/admin/abuse totals a
    client's writes, and that total is what a block gets decided on.
    """
    c = TestClient(main.app)
    x = c.post("/api/posts", json={"value": "8001", "title": "one end"}).json()
    y = c.post("/api/posts", json={"value": "8002", "title": "the other"}).json()

    def links():
        con = db.connect()
        try:
            return con.execute(
                """SELECT COUNT(*) FROM events
                   WHERE action = 'LINK' AND target_id = ?""", (x["id"],)
            ).fetchone()[0]
        finally:
            con.close()

    assert c.post(f"/api/posts/{x['id']}/links",
                  json={"other_id": y["id"]}).status_code == 201
    assert links() == 1
    # same pair, same answer, and the caller cannot tell -- which is the point:
    # it is already linked, so 201 is true
    assert c.post(f"/api/posts/{x['id']}/links",
                  json={"other_id": y["id"]}).status_code == 201
    assert links() == 1, "a link that was already there wrote a second row"
    assert [r["id"] for r in
            c.get(f"/api/posts/{x['id']}").json()["related"]] == [y["id"]]


def test_a_500_leaves_a_row_in_the_log():
    """The one log this repo has is where a crash belongs, and the dashboard
    already draws it.

    `raise_server_exceptions=False` because Starlette re-raises after calling
    the handler so the server can still log it -- which is also why the stdout
    traceback is untouched by this. The stand-in break is `seo.index_html`,
    since the real one this closes was exactly there: a backslash in a title
    reaching `re.sub` as a replacement string.
    """
    broken = TestClient(main.app, raise_server_exceptions=False)
    real = seo.index_html
    seo.index_html = lambda *a, **k: (_ for _ in ()).throw(ValueError("boom"))
    try:
        res = broken.get("/")
    finally:
        seo.index_html = real
    assert res.status_code == 500, res.status_code
    assert "nothing you sent was saved" in res.json()["detail"], res.text

    con = db.connect()
    try:
        row = con.execute(
            "SELECT * FROM events WHERE action = 'ERROR' ORDER BY id DESC"
        ).fetchone()
        assert row is not None, "the crash went nowhere"
        # nobody decided this, and it is about no entry
        assert row["admin_id"] is None and row["target_type"] is None
        assert row["ip_hash"], "an error still says which client hit it"
        meta = json.loads(row["meta"])
        assert meta["error"] == "ValueError", meta
        # the route's *pattern*, never the path as typed: a crash on a path a
        # stranger composed would otherwise sit forever in the one table
        # `purge` cannot reach
        assert meta["route"] == "GET /{path:path}", meta
        assert meta["where"].startswith("test_namba.py:"), meta
        # and never the message, for the same reason
        assert "boom" not in row["meta"], row["meta"]
    finally:
        con.close()

    # The two back-office queries, called as functions rather than over a signed-in
    # client: creating an operator here would make this test the *first* account
    # in the process, and being first is what test_admin_accounts asserts about
    # its own. What is being checked is the SQL either way.
    con = db.connect()
    try:
        feed = lambda k: {e["action"] for e in admin_api.activity(  # noqa: E731
            kind=k, limit=50, offset=0, _=None, con=con)["rows"]}
        assert "ERROR" in feed("all"), "the dashboard's own feed has to show it"
        assert "ERROR" not in feed("anon"), "a 500 is not a change to the wiki"

        # a write is a write and a crash is not one, or the single number that
        # says whether a spam wave is happening counts the server falling over
        before = admin_api.stats(_=None, con=con)["writes_1h"]
    finally:
        con.close()
    seo.index_html = lambda *a, **k: (_ for _ in ()).throw(KeyError("k"))
    try:
        assert TestClient(main.app, raise_server_exceptions=False
                          ).get("/").status_code == 500
    finally:
        seo.index_html = real
    con = db.connect()
    try:
        assert admin_api.stats(_=None, con=con)["writes_1h"] == before
    finally:
        con.close()

    # the case this runs in is the case where the database is what broke, so
    # the handler failing must still answer the request
    dead, events.record = events.record, lambda *a, **k: 1 / 0
    seo.index_html = lambda *a, **k: (_ for _ in ()).throw(ValueError("boom"))
    try:
        again = TestClient(main.app, raise_server_exceptions=False).get("/")
    finally:
        seo.index_html, events.record = real, dead
    assert again.status_code == 500, "a handler that raises answers nothing"


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

    # /uploads is the one place a stranger's bytes come back off our own
    # origin, and the upload route never looks inside the file -- so the type
    # StaticFiles guesses from the name has to be binding rather than a hint
    served = c.get("/uploads/shown.png")
    assert served.headers["x-content-type-options"] == "nosniff", served.headers
    assert c.get("/api/tags").headers["x-content-type-options"] == "nosniff"

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


def test_backup_is_a_consistent_copy():
    """`python backup.py` writes a copy of the database that opens whole, with
    the key beside it, and keeps only the newest few.

    A WAL database is two files while it is open -- the main file and the
    -wal holding writes not yet checkpointed -- so `cp` of the main file is a
    copy of the database as it was at the last checkpoint, minus whatever came
    after. The online backup API copies pages under the reader lock and is
    the one way to take a copy while the wiki is up.
    """
    import backup

    c = TestClient(main.app)
    p = c.post("/api/posts", json={"value": "3301", "title": "Cicada"}).json()
    # a write the WAL still holds: nothing has checkpointed since
    c.patch(f"/api/posts/{p['id']}", json={"title": "Cicada 3301", "author": "z"})

    dest = os.path.join(_tmp, "backups")
    made = backup.run(dest, keep=2)
    assert os.path.dirname(made) == dest and made.endswith(".db"), made
    copy = sqlite3.connect(made)
    assert copy.execute("SELECT title FROM posts WHERE id = ?", (p["id"],)
                        ).fetchone()[0] == "Cicada 3301", "the copy is behind the WAL"
    assert copy.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    copy.close()
    # the key travels with the database: without it every hash in events and
    # every block stops matching anything, and nothing complains
    assert open(os.path.join(dest, "secret.key"), "rb").read() == events.SECRET

    # keep=2: a third run leaves the two newest and removes the oldest
    time.sleep(1.1)   # names are whole seconds
    second = backup.run(dest, keep=2)
    time.sleep(1.1)
    third = backup.run(dest, keep=2)
    kept = sorted(f for f in os.listdir(dest) if f.endswith(".db"))
    assert kept == sorted(os.path.basename(x) for x in (second, third)), kept
    assert not os.path.exists(made), "the oldest copy was kept past --keep"


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



def test_the_share_card_is_a_real_png():
    """`Namba-frontend/public/og.png` exists and is 1200x630.

    The one asset in this repo, and the head points every page at it by name --
    so a missing or resized file is a broken card on every share, and nothing
    else would notice. The size is not decoration: Facebook, Slack and Twitter
    all crop from 1.91:1, and a card that is not that shape gets cut somewhere
    nobody chose.

    Read by hand out of the IHDR chunk rather than with Pillow, which is not a
    dependency of this app and is not worth becoming one for eight bytes.
    """
    path = os.path.join(db.DIR, os.pardir, "Namba-frontend", "public", seo.OG_CARD)
    assert os.path.isfile(path), f"{path} is gone; every share card is a 404"
    with open(path, "rb") as fh:
        head = fh.read(24)
    assert head[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG, and a scraper will not guess"
    width, height = struct.unpack(">II", head[16:24])
    assert (width, height) == (1200, 630), (width, height)

if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
    print("all good")
