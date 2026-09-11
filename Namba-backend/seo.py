"""The <head> this wiki writes for a crawler, and the locale it writes it in.

Here rather than in `main.py` for the reason `store.py` is not in there either:
this is four hundred lines with nothing to do with the wiki's API, and the file
it was in is the wiki's API. Nothing in it touches the database except to ask
which entries are filed under a value, nothing in it is a route, and nothing in
it reads a file -- `main.py` owns where `dist/` is and hands the document in.

The arrow points one way, the same as everywhere else here: `main.py` imports
this, so **nothing in this file may import main**. What both need is below
both -- `db.py`, `store.py` for `LIVE`, `section_of` and `section_where`,
`numfmt.py` for `grouped_value`, and `seo_locale.py` for the words.

Why any of it exists: a crawler does not run the JavaScript that would set a
title, so the head has to arrive already written, which is the whole reason
this API serves the front end at all. `Namba-frontend/CLAUDE.md` says nothing
in that app should try.
"""
import html
import json
import re
from typing import Optional
from urllib.parse import quote, unquote

from fastapi.responses import HTMLResponse

import seo_locale
from db import nfc
from numfmt import date_key, grouped_value
from store import LIVE, section_of, section_where

# Derived, not spelled again: a locale the interface offers is exactly one
# seo_locale has prose for. Written out here, the two lists could disagree, and
# the disagreement is silent in the direction that matters -- `words()` falls
# back to English for a locale it does not know, so the page would answer
# `<html lang="it">` over English text.
UI_LOCALES = set(seo_locale.TEXT)
UI_LOCALE_COOKIE = "namba_ui_locale"


def _ui_locale(raw):
    """One supported UI locale from a cookie or Accept-Language token."""
    code = (raw or "").strip().lower()
    if code.startswith("zh"):
        return "zh-Hans"
    base = code.split("-", 1)[0]
    return base if base in UI_LOCALES else None


def request_ui_locale(request):
    """The punctuation to use in server-written titles and share cards.

    The explicit interface choice is mirrored to a small cookie by the client.
    Before that exists, the browser's ordered Accept-Language list is the only
    preference available to a server or link-preview crawler.
    """
    chosen = _ui_locale(request.cookies.get(UI_LOCALE_COOKIE))
    if chosen:
        return chosen
    weighted = []
    for position, part in enumerate(request.headers.get("accept-language", "").split(",")):
        token, *params = part.strip().split(";")
        quality = 1.0
        for param in params:
            if param.strip().startswith("q="):
                try:
                    quality = float(param.strip()[2:])
                except ValueError:
                    quality = 0
        weighted.append((-quality, position, token))
    for quality, _, token in sorted(weighted):
        if quality == 0:
            continue
        chosen = _ui_locale(token)
        if chosen:
            return chosen
    return "en"


OG_STRIP = [
    (re.compile(r"```[\s\S]*?```"), " "),        # fenced code
    (re.compile(r"^\s{0,3}#{1,6}\s+", re.M), ""),  # headings
    (re.compile(r"^\s{0,3}>\s?", re.M), ""),       # quotes
    (re.compile(r"^\s{0,3}[-*+]\s+", re.M), ""),   # bullets
    (re.compile(r"!?\[([^\]]*)\]\([^)]*\)"), r"\1"),  # links and images
    (re.compile(r"[*`~]"), ""),
    (re.compile(r"\s+"), " "),
]
OG_DESC = 200
# How many entry titles a list page's description names before it counts the
# rest. Four fit inside OG_DESC beside the number and still read as a sentence;
# a description that lists forty is a keyword list, not an answer to anything.
DESC_TITLES = 4
# Schema.org asks for a headline of 110 characters or fewer; a title here may
# be 200. Clipped rather than dropped, since the whole of it is in `name` and
# in the <title> either way.
HEADLINE = 110
# The waiver the footer states and the form's Publish button repeats. In the
# head as well now, because a machine reading this wiki should not have to
# infer whether it may quote it.
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"
# The card a page falls back to when it has no picture of its own -- which is
# every page: not one entry in this wiki has an image, so this is not the
# exception, it is what a pasted Namba link looks like in Slack, on Twitter and
# in iMessage. There is no route for it here. It is a file in the front end's
# public/, so Vite copies it to dist/ and the catch-all at the bottom serves it
# like any other build output; test_the_share_card_is_a_real_png keeps it
# 1200x630, which is the size the scrapers crop from.
OG_CARD = "og.png"


def clip(s: str, n: int = OG_DESC) -> str:
    """A line of prose, no longer than n, ending in an ellipsis if it was."""
    return s[: n - 1].rstrip() + "…" if len(s) > n else s


def og_summary(body: str) -> str:
    """A markdown body as one line of prose, for a share card.

    A second, simpler cousin of plain() in the front end's api.ts. They are not
    kept in step and do not need to be: one feeds a preview row, the other a
    meta tag, and nobody sees both at once. Neither is a parser.
    """
    for rx, sub in OG_STRIP:
        body = rx.sub(sub, body)
    return clip(body.strip())


def enc(seg: str) -> str:
    """One path segment, percent-encoded exactly as encodeURIComponent is.

    entryPath() and tagPath() in api.ts build every /n/, /a/ and /t/ link that
    way.
    A canonical or a <loc> encoding it differently is a second URL for one
    page -- and on a wiki whose values include 11/22/63 and 9¾, that is most
    of them. The safe set below is encodeURIComponent's, character for
    character.
    """
    return quote(seg, safe="-_.!~*'()")


# The two things a section decides out here: the path segment its values are
# read at, and the noun seo_locale.py says it in. One question each, asked of
# the same three names, so they sit together rather than a ternary apart.
SECTION_PATH = {"number": "n", "abbr": "a", "calendar": "c"}
SECTION_KIND = {"number": "number", "abbr": "abbreviation", "calendar": "calendar"}


def value_path(section: str, value: str) -> str:
    """Where an entry's value is read: /a/UFO for an abbreviation, /c/12-25 for
    a date, /n/42 for a number. The twin of entryPath() in api.ts, and the
    reason both exist is that a format decides an address -- take the section
    off the row through section_of(), never guess it from the characters.
    """
    return f"{SECTION_PATH[section]}/{enc(value)}"


def path_seg(request, prefix: str) -> Optional[str]:
    """The one segment after /n/, /a/, /c/ or /t/, as the reader typed it.

    Read off the raw path rather than the decoded one the router hands us,
    because a value may contain a slash: 11/22/63 is a date and a number here,
    and by the time ASGI has decoded the path, "n/11%2F22%2F63" and a
    three-segment path are the same string. This is the same trap the front end
    documents -- always pass a value to the API as a query param, never as a
    path segment -- reached from the other side.

    Exactly one segment, so /n/42/anything is not /n/42. The client's router
    does not match that either, and a page which does not exist must not be
    handed a canonical claiming it does.
    """
    raw = request.scope.get("raw_path") or request.scope["path"].encode()
    rest = raw.decode("utf-8", "replace").split("?", 1)[0].lstrip("/")
    if not rest.startswith(prefix) or "/" in rest[len(prefix):]:
        return None
    return nfc(unquote(rest[len(prefix):])) or None


def json_ld(data) -> str:
    """JSON-LD as it may safely sit inside a <script> in this document.

    Every "<" is escaped, not the closing tag alone: an entry title is written
    by a stranger, and "</script>" inside a JSON string ends the block for the
    HTML parser whatever the JSON makes of it. ensure_ascii off, so a Korean
    title stays legible to anything reading the source.
    """
    return json.dumps(
        data, ensure_ascii=False, separators=(",", ":")
    ).replace("<", "\\u003c")


def write_head(page: str, *, title=None, desc=None, canonical=None,
               robots=None, og=(), ld=None, locale="en") -> str:
    """Put this page's own head into the built index.html.

    One writer for all seven public routes. Title and description are *replaced*
    -- two <title>s and the browser keeps the first -- and everything else is
    appended before </head>.

    Both substitutions pass a callable rather than a string, and that is not a
    style choice: re.sub reads a *string* replacement for group references, so
    a title carrying a backslash -- "C:\\1\\2" is a fine thing to write an entry
    about -- would raise `invalid group reference` and answer this page with a
    500 on every load. html.escape does not touch a backslash and should not;
    it escapes for HTML, and this is a regex problem wearing its clothes.
    """
    # The first response has to identify its language before React runs. This
    # is also what crawlers and assistive technology read; the client keeps it
    # in step when a person changes the interface language without a reload.
    page, changed = re.subn(
        r'(<html\b[^>]*\blang=")[^"]*(")',
        lambda hit: (
            f"{hit.group(1)}{html.escape(locale, quote=True)}{hit.group(2)}"
        ),
        page, count=1, flags=re.I,
    )
    if not changed:
        page = re.sub(
            r"<html\b", f'<html lang="{html.escape(locale, quote=True)}"',
            page, count=1, flags=re.I,
        )
    if title is not None:
        esc = html.escape(title, quote=True)
        page = re.sub(r"<title>[^<]*</title>", lambda _: f"<title>{esc}</title>",
                      page, count=1)
    if desc is not None:
        d = html.escape(desc, quote=True)
        page = re.sub(
            r'<meta name="description" content="[^"]*"\s*/?>',
            lambda _: f'<meta name="description" content="{d}" />',
            page, count=1,
        )
    out = []
    if canonical:
        out.append(f'<link rel="canonical" href="{html.escape(canonical, quote=True)}" />')
    if robots:
        out.append(f'<meta name="robots" content="{robots}" />')
    for k, v in og:
        # og: is RDFa and wants property=; twitter: is not and wants name=. It
        # was property= on both, which Twitter tolerates and a validator does
        # not.
        attr = "name" if k.startswith("twitter:") else "property"
        out.append(f'<meta {attr}="{k}" content="{html.escape(v, quote=True)}" />')
    if ld:
        out.append(f'<script type="application/ld+json">{json_ld(ld)}</script>')
    if not out:
        return page
    return page.replace("</head>", "  " + "\n    ".join(out) + "\n  </head>", 1)


def og_tags(title, desc, url, kind, base, image=None, locale="en"):
    """The share card.

    twitter:card alone beside the og: tags: Twitter reads og:title,
    og:description and og:image when its own are missing, so a second copy of
    each would be three more lines saying the same thing.

    Always the large card, because there is always an image: an entry's own
    picture when it has one, and OG_CARD when it does not. The small "summary"
    card would describe every page on the site, and a pasted link comes out of
    it a bare grey rectangle with the title beside it.

    og:image:alt only for the fallback. It says what that card actually reads,
    which is a thing this file knows. An entry's uploaded picture has no alt
    text stored anywhere, and the title is a caption for the entry rather than
    a description of the image, so writing one from it would be inventing it.
    """
    alt = None
    if not image:
        image, alt = f"{base}{OG_CARD}", seo_locale.words(locale)["image_alt"]
    tags = [("og:type", kind), ("og:site_name", "Namba"),
            ("og:locale", seo_locale.OG_LOCALES[locale]),
            ("og:title", title), ("og:description", desc), ("og:url", url),
            ("twitter:card", "summary_large_image"), ("og:image", image)]
    tags.extend(
        ("og:locale:alternate", code)
        for name, code in seo_locale.OG_LOCALES.items() if name != locale
    )
    if alt:
        tags.append(("og:image:alt", alt))
    return tags


def site_ld(base, locale="en"):
    """The wiki itself, as the thing every other page says it belongs to.

    Given an @id so the four page types point at one node rather than each
    describing a separate website that happens to share a name.
    """
    return {"@type": "WebSite", "@id": f"{base}#site", "name": "Namba",
            "url": base, "inLanguage": locale, "license": CC0}


def crumbs(base, trail):
    """Namba, then the way down to here. The site is always the first crumb."""
    items = [("Namba", base)] + list(trail)
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": i, "name": name, "item": url}
                for i, (name, url) in enumerate(items, 1)]}


def head_home(page, base, locale="en"):
    """The front page: the wiki, and the fact that it can be searched."""
    text = seo_locale.words(locale)
    title, desc = text["site_title"], text["site_desc"]
    ld = dict(site_ld(base, locale), **{
        "@context": "https://schema.org",
        "description": desc,
        "potentialAction": {
            "@type": "SearchAction",
            # a real route: the header's search form navigates to exactly this
            "target": {"@type": "EntryPoint",
                       "urlTemplate": f"{base}search?q={{search_term_string}}"},
            "query-input": "required name=search_term_string",
        },
    })
    # canonical is the bare base on purpose. ?view=feed, ?format= and ?tag= all
    # re-sort or filter the same index, and ?tag=book is the page /t/book
    # already is -- four addresses for one page, and this says which of them.
    return write_head(
        page, title=title, desc=desc, canonical=base, ld=[ld], locale=locale,
        og=og_tags(title, desc, base, "website", base=base, locale=locale),
    )


def head_guide(page, base, locale="en"):
    """The rules page: the one route here that is prose rather than a query.

    Indexable, which makes it the exception to index_html()'s default and the
    reason that default is spelled out down there. Everything else it declines
    to index is a control (/random), a form (/new, /p/{id}/edit) or a path that
    does not exist. This is a page, it is the same page for everybody, and it
    is the one that says what the wiki will and will not keep -- which is what
    somebody searching for whether their number belongs here is looking for.

    Its own title and description rather than the site's blurb: a search result
    for this page that repeated the home page description
    would be indistinguishable from the front page.
    """
    url = base + "guide"
    text = seo_locale.words(locale)
    title, desc = text["guide_title"], text["guide_desc"]
    return write_head(
        page, title=title, desc=desc, canonical=url, locale=locale,
        og=og_tags(title, desc, url, "article", base=base, locale=locale),
        ld=[crumbs(base, [(text["guide_name"], url)])],
    )


def head_list(page, base, *, kind, subject, url, rows, locale="en"):
    """A page that is a list of entries: /n/{value}, /a/{value} or /t/{tag}.

    One shape for both, because they are one component in the front end for the
    same reason -- they differ only in which filter found the rows.

    An empty one is noindex. It is a real page and it invites you to write the
    first entry, but there is nothing on it to answer a search with, and /n/ is
    an open set: indexing /n/999999 would put an unbounded number of blank
    pages in front of the ones that say something.
    """
    if not rows:
        # a card even so. noindex is about a search result; a share card is
        # what a chat window draws, and the two do not consult each other --
        # "nobody has written about 1234 yet, want to?" is a link somebody
        # pastes on purpose, and it should not paste as a grey box.
        title = f"{subject} · Namba"
        empty = seo_locale.empty_summary(kind, subject, locale)
        return write_head(page, title=title, desc=empty, canonical=url,
                          robots="noindex, follow",
                          og=og_tags(title, empty, url, "website", base=base,
                                     locale=locale), locale=locale)
    n = len(rows)
    titles = [r["title"] for r in rows[:DESC_TITLES]]
    desc = clip(seo_locale.list_summary(kind, subject, titles, n, locale))
    title = seo_locale.list_title(subject, n, locale)
    page_ld = {
        "@context": "https://schema.org", "@type": "CollectionPage",
        "name": title, "url": url, "description": desc, "inLanguage": locale,
        "license": CC0, "isPartOf": site_ld(base, locale),
        "about": {"@type": "Thing", "name": subject},
        # the list is the page. Names as well as urls, because anything that
        # does not run the JavaScript has this and the description and nothing
        # else to tell it what is filed here.
        "mainEntity": {
            "@type": "ItemList", "numberOfItems": n,
            "itemListElement": [
                {"@type": "ListItem", "position": i,
                 "url": f"{base}p/{r['id']}", "name": r["title"]}
                for i, r in enumerate(rows, 1)],
        },
    }
    return write_head(page, title=title, desc=desc, canonical=url, locale=locale,
                      og=og_tags(title, desc, url, "website", base=base,
                                 locale=locale),
                      ld=[page_ld, crumbs(base, [(subject, url)])])


def head_number(con, page, value, base, locale="en"):
    rows = [dict(r) for r in con.execute(
        "SELECT id, title, grouped FROM posts WHERE value = ? AND status = ? "
        f"AND {section_where('number')} ORDER BY id", (value, LIVE))]
    # the rule the hero draws by: separators are a per-entry display flag, so
    # the page only groups when every entry filed under the number agrees
    shown = grouped_value(
        value, bool(rows) and all(r["grouped"] for r in rows), locale,
    )
    return head_list(page, base, kind="number", subject=shown,
                     url=f"{base}n/{enc(value)}", rows=rows, locale=locale)


def head_calendar(con, page, value, base, locale="en"):
    """The date section. Separate from head_number for the reason head_abbr is:
    a value stored as a date is not filed under the number, and the two say
    different words -- what 42 means, what happens on 12-25.

    No grouped_value and no NOCASE. There is no thousand in 12-25 and digits
    have no case, so this is the plainest of the three.

    The subject is the stored MM-DD rather than "25 December". The words around
    it are localized; the date is not. Rendering it would mean twelve month
    names in seven languages in seo_locale.py, to agree with a line the client
    already draws from Intl -- ponytail: the day a crawler reads the month name
    is the day to write those 84 strings, and not before.
    """
    rows = [dict(r) for r in con.execute(
        "SELECT id, title FROM posts WHERE value = ? AND status = ? "
        f"AND {section_where('calendar')} ORDER BY id", (value, LIVE))]
    return head_list(page, base, kind="calendar", subject=value,
                     url=f"{base}c/{enc(value)}", rows=rows, locale=locale)


def head_abbr(con, page, value, base, locale="en"):
    """The same page for the other section. Separate from head_number because
    the two say different words -- what a number means, what an abbreviation
    stands for -- and because a value stored as one is not filed under the
    other. No grouped_value: there is no thousand in UFO.
    """
    # /a/ufo is a link to the one abbreviation however it was typed, and the
    # page and its canonical say the spelling that is stored, not the link's
    rows = [dict(r) for r in con.execute(
        "SELECT id, title, value FROM posts WHERE value = ? COLLATE NOCASE "
        f"AND status = ? AND {section_where('abbr')} ORDER BY id", (value, LIVE))]
    if rows:
        value = rows[0]["value"]
    return head_list(page, base, kind="abbreviation", subject=value,
                     url=f"{base}a/{enc(value)}", rows=rows, locale=locale)


def head_tag(con, page, tag, base, locale="en"):
    tag = tag.lower()  # tagLabel() folds these, and /t/BOOK is an old link
    rows = [dict(r) for r in con.execute(
        "SELECT p.id, p.title FROM posts p JOIN post_tags t ON t.post_id = p.id "
        "WHERE t.tag = ? AND p.status = ? ORDER BY p.id", (tag, LIVE))]
    return head_list(page, base, kind="tag", subject=tag,
                     url=f"{base}t/{enc(tag)}", rows=rows, locale=locale)


def og_head(page: str, post: dict, base: str, tags=(), locale="en") -> str:
    """Give this page the entry's own title, description, dates and picture.

    Crawlers do not run the JavaScript that would set these client-side, so the
    <head> has to arrive already written -- which is the whole reason the API
    serves the front end at all.

    The JSON-LD is where this entry's provenance lives. On screen the byline is
    behind the Credits toggle and every date is relative by design ("2 days
    ago"), so an exact ISO timestamp belongs in a machine's channel rather than
    as a second date format nobody asked to read.
    """
    value = grouped_value(post["value"], post["grouped"], locale)
    title = f"{value} — {post['title']} · Namba"
    # The fallback names the entry, because 84% of this wiki is a title and no
    # body and "What 2 means, on Namba." was the description on all of them --
    # identical, word for word, on the 29 that share a number. A description
    # that cannot tell two pages apart is one a search engine drops.
    section = section_of(post["format"])
    desc = og_summary(post["body"]) or clip(seo_locale.post_summary(
        post["title"], value, SECTION_KIND[section], locale,
    ))
    img = f"{base}{post['image'].lstrip('/')}" if post["image"] else None
    url = f"{base}p/{post['id']}"
    article = {
        "@context": "https://schema.org", "@type": "Article",
        "headline": clip(post["title"], HEADLINE), "name": title,
        "description": desc, "url": url, "mainEntityOfPage": url,
        "datePublished": post["created_at"], "dateModified": post["updated_at"],
        # author is the first writer and is never overwritten; an editor is a
        # separate key here for the same reason it is a separate column.
        "author": {"@type": "Person", "name": post["author"]},
        "about": {"@type": "Thing", "name": value},
        "isPartOf": site_ld(base, locale), "license": CC0,
    }
    if post["edited_by"]:
        article["editor"] = {"@type": "Person", "name": post["edited_by"]}
    if img:
        article["image"] = img
    if tags:
        article["keywords"] = list(tags)
    if post["lang"]:
        # a free-form endonym, not a code -- Language takes a name, and this is
        # the name the wiki actually stored
        article["inLanguage"] = {"@type": "Language", "name": post["lang"]}
    return write_head(
        page, title=title, desc=desc, canonical=url, locale=locale,
        og=og_tags(title, desc, url, "article", base=base, image=img,
                   locale=locale)
           + [("article:published_time", post["created_at"]),
              ("article:modified_time", post["updated_at"])],
        ld=[article, crumbs(base, [(value, base + value_path(section,
                                                             post["value"])),
                                   (post["title"], url)])],
    )


def index_html(con, request, path: str, page: str, base: str) -> HTMLResponse:
    locale = request_ui_locale(request)

    def answer(body, content_locale=locale):
        res = HTMLResponse(body)
        # The number in a title varies by explicit UI preference first and
        # Accept-Language second. A cache must not hand the German spelling to
        # a French request (or the reverse).
        res.headers["Vary"] = "Accept-Language, Cookie"
        res.headers["Content-Language"] = content_locale
        return res

    if path == "":
        return answer(head_home(page, base, locale))
    if path == "guide":
        return answer(head_guide(page, base, locale))
    value = path_seg(request, "n/")
    if value is not None:
        return answer(head_number(con, page, value, base, locale))
    abbr = path_seg(request, "a/")
    if abbr is not None:
        return answer(head_abbr(con, page, abbr, base, locale))
    date = path_seg(request, "c/")
    # /c/ is the one closed section: a day of the year is a fixed set of 366
    # addresses, so /c/99-99 is not an empty date page, it is not a page. The
    # other two are open sets and keep their empty state -- /n/999999 and
    # /a/QQQ are values nobody has written about yet, which is a different
    # answer from a value there is no such thing as. date_key() draws the line,
    # the same function resolve_format() refuses a write with.
    if date is not None and date_key(date) is not None:
        return answer(head_calendar(con, page, date, base, locale))
    tag = path_seg(request, "t/")
    if tag is not None:
        return answer(head_tag(con, page, tag, base, locale))
    hit = re.fullmatch(r"p/(\d+)", path)
    if hit:
        row = con.execute("SELECT * FROM posts WHERE id = ? AND status = ?",
                          (hit.group(1), LIVE)).fetchone()
        if row:
            tags = [r["tag"] for r in con.execute(
                "SELECT tag FROM post_tags WHERE post_id = ? ORDER BY tag",
                (hit.group(1),))]
            return answer(og_head(page, dict(row), base, tags, locale))
    # Everything else: /search, /random, /new, /p/{id}/edit, an entry an
    # operator took down, and every mistyped path -- which answers 200 with the
    # app's "Nothing here" and would otherwise be indexed as a copy of the
    # front page. None of them is a page to keep: three are controls, one is a
    # form, and the rest do not exist.
    #
    # One default rather than a list of the routes, deliberately. A list would
    # be a second copy of App.tsx's <Routes> living over here, and a route
    # added there would arrive claiming to be indexable until somebody
    # remembered this file. Being indexable is the thing that has to be spelled
    # out; not being indexable is the safe answer to give a stranger.
    return answer(write_head(page, robots="noindex, follow", locale=locale))
