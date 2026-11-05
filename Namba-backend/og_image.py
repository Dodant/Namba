"""The picture a shared link unfurls into: one per entry, one per value page.

Drawn here, in the process that holds the entry, for the reason seo.py writes
the <head> here: a scraper does not run JavaScript, and the card has to say
what the page says. Pillow draws it; the fonts are the site's own (Newsreader
for the numeral, IBM Plex Mono for the chrome, Gowun Batang for Hangul) as
subset WOFF2 files in fonts/, with Noto Serif for the Greek and the operators
Newsreader has no glyphs for -- pi is a value here.

Nothing is stored. A card is a pure function of a `Card`, which is built from
the live row on every request, so an edit is a new card and a hidden entry is
no card at all. `render` is cached on that tuple, and the URL seo.py writes
carries a digest of it, so a scraper's copy goes stale exactly when the entry
does. The composition is seeded from the value -- never from the clock or the
id -- so 42 is the same picture on every page it appears on and on every
deploy.

Nothing here may import seo or main: seo.py imports this to write the URL.
"""
import colorsys
import hashlib
import io
import math
import os
import random
from collections import Counter
from functools import lru_cache
from typing import NamedTuple, Optional
from urllib.parse import urlencode, urlsplit

from PIL import Image, ImageChops, ImageCms, ImageDraw, ImageFont

from db import nfc
from numfmt import grouped_value
from store import LIVE, section_of, section_where

W, H = 1200, 630
# Drawn at twice the size and scaled down. Pillow does not antialias a line,
# and a times-table circle is three hundred of them; the downsample is the
# antialiasing.
S = 2
FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
SERIF, GREEK, MONO, HANGUL = ("Newsreader.woff2", "NotoSerif-Greek.woff2",
                              "IBMPlexMono-Medium.woff2", "GowunBatang.woff2")
# Which face draws a character: the first in the chain that has it.
DISPLAY = (SERIF, GREEK, MONO, HANGUL)
LABEL = (MONO, GREEK, HANGUL)
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
SECTION_PATH = {"number": "n", "abbr": "a", "calendar": "c"}
# The name printed in the corner. Configured, never read off the request: a
# Host header is the client's to choose, and a card drawn from it would be a
# publicly cached picture saying whatever a stranger sent -- and a fresh
# render, past the cache, for every name they tried.
HOST = urlsplit(os.environ.get("NAMBA_BASE_URL", "")).netloc or "namba.chiral.kr"

# index.css, light theme: the paper, the ink and the three inks the site
# already marks things with.
PAPER, INK = (247, 244, 236), (23, 23, 18)
ACCENT, HIT, TODAY, OCHRE = (26, 77, 60), (180, 71, 43), (28, 79, 134), (176, 128, 32)

# A room for each kind of meaning. Tags are free-form (ADR-0010), so this is
# a reading of the vocabulary in use rather than a list anything must agree
# with: a tag nobody mapped falls through to the format, then to "index". The
# order breaks ties, most particular first.
ROOMS = (
    ("cosmos", {"space", "astronomy", "cosmos", "planet", "star", "nasa"}),
    ("math", {"math", "mathematics", "rule", "prime", "geometry", "statistics",
              "logic"}),
    ("physics", {"science", "physics", "unit", "tech", "chemistry", "biology",
                 "computing", "engineering", "medicine"}),
    ("archive", {"history", "religion", "myth", "person", "place", "war",
                 "politics", "law", "calendar"}),
    ("culture", {"movie", "film", "music", "brand", "slang", "meme", "game",
                 "sports", "tv", "anime", "book", "art", "food"}),
)


class Card(NamedTuple):
    """Everything a card draws, and nothing else -- the cache key and the
    digest in the URL are this tuple, so a field here that is not drawn would
    bust both for nothing, and a field drawn that is not here would serve a
    stale picture."""
    value: str            # as displayed: grouped for the locale
    address: str          # /n/42
    titles: tuple
    more: int             # entries on the page beyond the titles drawn
    tags: tuple
    room: str
    seed: int
    year: Optional[int]


def room_of(tags, formats) -> str:
    votes = Counter(name for t in tags for name, words in ROOMS if t.lower() in words)
    if votes:
        order = [name for name, _ in ROOMS]
        return max(votes, key=lambda n: (votes[n], -order.index(n)))
    if "CALENDAR" in formats:
        return "archive"
    if "ABBR" in formats:
        return "culture"
    return "index"


def seed_of(section, value) -> int:
    # an abbreviation is one page whatever its case, so one picture too
    key = f"{section}:{value.casefold() if section == 'abbr' else value}"
    return int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big")


def entry_card(post, tags, locale="en") -> Card:
    section = section_of(post["format"])
    return Card(
        value=grouped_value(post["value"], post["grouped"], locale),
        address=f"/{SECTION_PATH[section]}/{post['value']}",
        titles=(post["title"],), more=0, tags=tuple(tags)[:3],
        room=room_of(tags, {post["format"]}),
        seed=seed_of(section, post["value"]),
        year=post.get("year"),
    )


def value_card(con, section, value, locale="en") -> Optional[Card]:
    """The card for /n/42, /a/UFO or /c/12-25: the value and what it means.
    None for a value nobody has written about, which keeps the static card
    -- and keeps an open set of addresses from being an open set of renders.
    """
    fold = " COLLATE NOCASE" if section == "abbr" else ""
    rows = [dict(r) for r in con.execute(
        f"SELECT id, value, title, format, grouped FROM posts WHERE value = ?{fold} "
        f"AND status = ? AND {section_where(section)} ORDER BY id",
        (nfc(value), LIVE))]
    if not rows:
        return None
    value = rows[0]["value"]  # the stored spelling, as head_abbr says it
    tags = [r["tag"] for r in con.execute(
        "SELECT tag FROM post_tags WHERE post_id IN (%s) ORDER BY tag"
        % ",".join("?" * len(rows)), [r["id"] for r in rows])]
    common = tuple(t for t, _ in Counter(tags).most_common(3))
    grouped = all(r["grouped"] for r in rows)
    return Card(
        value=grouped_value(value, grouped, locale),
        address=f"/{SECTION_PATH[section]}/{value}",
        titles=tuple(r["title"] for r in rows[:3]), more=max(0, len(rows) - 3),
        tags=common, room=room_of(tags, {r["format"] for r in rows}),
        seed=seed_of(section, value), year=None,
    )


def card_url(base, card: Card, locale, *, post_id=None) -> str:
    """Where a card is fetched from, with a digest of what it draws, so a
    scraper that cached the old picture is handed a new address the moment
    the entry changes rather than whenever its own cache expires."""
    digest = hashlib.sha256(repr(card).encode()).hexdigest()[:12]
    if post_id is not None:
        return f"{base}og/p/{post_id}.png?" + urlencode({"l": locale, "h": digest})
    seg, value = card.address.strip("/").split("/", 1)
    return f"{base}og/{seg}.png?" + urlencode({"v": value, "l": locale, "h": digest})


def card_alt(card: Card) -> str:
    return f"{card.value} — {' · '.join(card.titles)}"


# --- type ---------------------------------------------------------------

@lru_cache(maxsize=48)
def font(name, size, wght=400):
    f = ImageFont.truetype(os.path.join(FONTS, name), size)
    if name == SERIF:
        # weight, then optical size in points: the display cut above 48
        f.set_variation_by_axes([wght, 72 if size > 96 else 16])
    elif name == GREEK:
        f.set_variation_by_axes([wght, 100])
    return f


@lru_cache(maxsize=4096)
def has(name, ch) -> bool:
    """Whether a face has a glyph for ch. Pillow has no cmap query, so the
    test is whether it draws anything other than what it draws for a code
    point no font has."""
    f = font(name, 40)
    got, none = f.getmask(ch), f.getmask("\U0010FFFF")
    return got.size != none.size or bytes(got) != bytes(none)


def glyphs(text, chain, size, wght=400, track=0.0):
    """(x, char, face) for each character, and the width of the run. One
    character at a time: it is how a fallback face gets a word in, and how
    tracking is done at all."""
    out, x = [], 0.0
    for ch in text:
        name = next((n for n in chain if has(n, ch)), chain[0])
        f = font(name, size, wght)
        out.append((x, ch, f))
        x += f.getlength(ch) + track * size
    return out, x - (track * size if text else 0)


def draw_run(d, run, x, y, fill, anchor="ls"):
    for dx, ch, f in run:
        d.text((x + dx, y), ch, font=f, fill=fill, anchor=anchor)


def ink(run, y0=0):
    """The vertical extent the run actually paints, relative to its baseline."""
    top, bottom = 0, 0
    for _, ch, f in run:
        if ch.strip():
            box = f.getbbox(ch, anchor="ls")
            top, bottom = min(top, box[1]), max(bottom, box[3])
    return top, bottom


def clip_to(text, chain, size, width, wght=400, track=0.0):
    if glyphs(text, chain, size, wght, track)[1] <= width:
        return text
    while text and glyphs(text + "…", chain, size, wght, track)[1] > width:
        text = text[:-1]
    return text.rstrip() + "…"


def lines_of(value, n):
    """The value in n lines, broken where it already breaks -- a space, a
    separator -- nearest an even split, so 1,000,000,000,000 wraps after a
    comma and never inside a group if it can help it."""
    if n == 1:
        return [value]
    soft = [i + 1 for i, c in enumerate(value[:-1]) if c in " ,.'·/-×^:"]
    cuts, start = [], 0
    for k in range(1, n):
        aim = round(len(value) * k / n)
        near = [c for c in soft if start < c < len(value)]
        cut = min(near, key=lambda c: abs(c - aim)) if near else aim
        if abs(cut - aim) > len(value) / (2 * n):
            cut = aim
        cuts.append(cut)
        start = cut
    parts = [value[a:b] for a, b in zip([0] + cuts, cuts + [len(value)])]
    return [p.strip() for p in parts if p.strip()]


# --- the composition, in 2x units ----------------------------------------

M = 72 * S                      # the safe margin, all four sides
RULE = 506 * S                  # the hairline the museum label sits under
HERO_TOP, HERO_FLOOR = 132 * S, 486 * S


def theme(room, rng):
    if room == "cosmos":
        return dict(bg=(14, 16, 24), fg=(238, 234, 222), accent=(125, 179, 224),
                    glow=(46, 64, 128))
    if room == "culture":
        bg = rng.choice((HIT, ACCENT, TODAY, OCHRE))
        return dict(bg=bg, fg=PAPER, accent=INK, glow=tuple(min(255, c + 70) for c in bg))
    if room == "archive":
        return dict(bg=(238, 230, 212), fg=(40, 33, 25), accent=HIT, glow=(168, 122, 64))
    if room == "physics":
        return dict(bg=(243, 242, 236), fg=INK, accent=TODAY, glow=TODAY)
    return dict(bg=PAPER, fg=INK, accent=ACCENT, glow=HIT if room == "index" else ACCENT)


def rgba(c, a):
    return (*c[:3], int(a))


def atmosphere(img, t, rng):
    """Two soft light sources, worked out on a 32x17 grid and stretched --
    a gradient Pillow can draw in a millisecond, and smooth because bicubic
    has nothing sharp to stretch."""
    gw, gh = 32, 17
    field = Image.new("RGB", (gw, gh), t["bg"])
    blobs = [(rng.uniform(0.55, 1.0) * gw, rng.uniform(0.0, 0.6) * gh, rng.uniform(9, 16)),
             (rng.uniform(0.0, 0.4) * gw, rng.uniform(0.6, 1.0) * gh, rng.uniform(6, 11))]
    px = field.load()
    for y in range(gh):
        for x in range(gw):
            k = sum(0.16 * math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (r * r))
                    for bx, by, r in blobs)
            px[x, y] = tuple(round(b + (g - b) * k) for b, g in zip(t["bg"], t["glow"]))
    img.paste(field.resize(img.size, Image.BICUBIC))


def motif_math(d, t, rng, card):
    """A times table on a circle: point k joined to point k*m. m is the
    number itself where it is one, so 42's circle is 42's."""
    for x in range(M, W * S - M + 1, 24 * S):
        for y in range(M, RULE - 24 * S, 24 * S):
            d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=rgba(t["fg"], 46))
    n = rng.choice((90, 120, 144, 180))
    digits = "".join(c for c in card.value if c.isdigit())
    m = int(digits[-6:]) % n if digits else 0
    if m < 2:
        m = rng.randint(2, n - 1)
    cx, cy, r = W * S * 0.765, H * S * 0.42, H * S * 0.33
    p = [(cx + r * math.cos(2 * math.pi * k / n - math.pi / 2),
          cy + r * math.sin(2 * math.pi * k / n - math.pi / 2)) for k in range(n)]
    for k in range(n):
        d.line((p[k], p[(k * m) % n]), fill=rgba(t["accent"], 72), width=2)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=rgba(t["fg"], 110), width=3)
    for x, y in p[:: max(1, n // 24)]:
        d.ellipse((x - 4, y - 4, x + 4, y + 4), fill=rgba(t["fg"], 160))


def motif_physics(d, t, rng, card):
    """Two sources and their wavefronts: the interference does the drawing."""
    for _ in range(2):
        sx = rng.uniform(0.62, 0.95) * W * S
        sy = rng.uniform(0.15, 0.6) * H * S
        step = rng.choice((26, 30, 34)) * S
        for i in range(1, 26):
            r = i * step
            d.ellipse((sx - r, sy - r, sx + r, sy + r),
                      outline=rgba(t["accent"], max(14, 96 - i * 3)), width=2)
        d.ellipse((sx - 7, sy - 7, sx + 7, sy + 7), fill=rgba(t["accent"], 220))


def spectrum(img, t):
    """The rule, for physics, is light: a thin visible spectrum."""
    band = Image.new("RGB", (256, 1))
    band.putdata([tuple(round(c * 255) for c in colorsys.hsv_to_rgb(0.78 * i / 255, 0.62, 0.86))
                  for i in range(256)])
    img.paste(band.resize((W * S - 2 * M, 4 * S), Image.BILINEAR), (M, RULE - S))


def motif_cosmos(d, t, rng, card):
    for _ in range(460):
        x, y = rng.uniform(0, W * S), rng.uniform(0, RULE)
        r = rng.choice((1, 1, 1, 2, 2, 3))
        d.ellipse((x - r, y - r, x + r, y + r), fill=rgba(t["fg"], rng.randint(50, 210)))
    cx, cy, tilt = W * S * 0.74, H * S * 0.40, math.radians(rng.uniform(-26, -10))
    for i, rx in enumerate((230 * S, 340 * S, 470 * S)):
        ry = rx * 0.3
        pts = [(cx + rx * math.cos(a) * math.cos(tilt) - ry * math.sin(a) * math.sin(tilt),
                cy + rx * math.cos(a) * math.sin(tilt) + ry * math.sin(a) * math.cos(tilt))
               for a in (2 * math.pi * k / 240 for k in range(241))]
        d.line(pts, fill=rgba(t["accent"], 70 - i * 14), width=2)
        if i == 1:
            x, y = pts[rng.randrange(240)]
            for g, a in ((26, 30), (16, 60), (9, 255)):
                d.ellipse((x - g, y - g, x + g, y + g), fill=rgba(t["accent"], a))
    for g, a in ((60, 18), (34, 40), (14, 255)):
        d.ellipse((cx - g, cy - g, cx + g, cy + g), fill=rgba(t["fg"], a))


def motif_culture(d, t, rng, card):
    """A halftone falling off from one corner, and the value's first figure
    drawn again at poster size, in outline, off the edge."""
    corner = rng.choice(((W * S, 0), (W * S, RULE)))
    for x in range(0, W * S + 1, 22 * S):
        for y in range(0, RULE, 22 * S):
            k = 1 - math.hypot(x - corner[0], y - corner[1]) / (W * S * 0.55)
            if k > 0:
                r = 9 * S * k
                d.ellipse((x - r, y - r, x + r, y + r), fill=rgba(t["accent"], 40))
    first = next((c for c in card.value if c.strip()), "")
    if first:
        size = 980 * S // 2 * 2
        run, _ = glyphs(first, DISPLAY, size, 500)
        f = run[0][2]
        d.text((W * S * rng.uniform(0.66, 0.74), H * S * 1.02), first, font=f,
               fill=rgba(t["bg"], 0), stroke_width=3 * S,
               stroke_fill=rgba(t["fg"], 90), anchor="ls")


def motif_archive(d, t, rng, card):
    """A ledger: ruled lines, a red margin, crop marks. The stamp is
    `stamp`, applied after the numeral."""
    for y in range(M + 40 * S, RULE, 28 * S):
        d.line(((0, y), (W * S, y)), fill=rgba(t["fg"], 22), width=2)
    for x in (44 * S, 50 * S):
        d.line(((x, 0), (x, H * S)), fill=rgba(HIT, 110), width=2)
    k, g = 22 * S, 18 * S
    for cx, cy, sx, sy in ((g, g, 1, 1), (W * S - g, g, -1, 1),
                           (g, H * S - g, 1, -1), (W * S - g, H * S - g, -1, -1)):
        d.line(((cx, cy), (cx + sx * k, cy)), fill=rgba(t["fg"], 150), width=2)
        d.line(((cx, cy), (cx, cy + sy * k)), fill=rgba(t["fg"], 150), width=2)


def stamp(img, t, rng, card):
    """A rubber stamp, struck over the numeral rather than knocked out of
    it -- a date as wide as 12-25 leaves no room beside it, and a stamp that
    lands on the text is what a stamp in an archive does."""
    r = 120 * S
    canvas = Image.new("RGBA", (2 * r + 8, 2 * r + 8), (0, 0, 0, 0))
    sd = ImageDraw.Draw(canvas)
    c = r + 4
    sd.ellipse((4, 4, 2 * r + 4, 2 * r + 4), outline=rgba(t["accent"], 170), width=3 * S)
    sd.ellipse((22 * S, 22 * S, 2 * r + 4 - 22 * S, 2 * r + 4 - 22 * S),
               outline=rgba(t["accent"], 170), width=S)
    # the year the entry is about when it has one, the wordmark when not --
    # nothing on a stamp is invented
    mark, size = (str(card.year), 46) if card.year else ("NAMBA", 30)
    run, w = glyphs(mark, LABEL, size * S, track=0.04)
    draw_run(sd, run, c - w / 2, c + 16 * S, rgba(t["accent"], 190))
    run, w = glyphs("ARCHIVE", LABEL, 13 * S, track=0.3)
    draw_run(sd, run, c - w / 2, c - 40 * S, rgba(t["accent"], 190))
    struck = canvas.rotate(rng.uniform(-16, -6), resample=Image.BICUBIC)
    img.alpha_composite(struck, (int(W * S * 0.80 - c), int(H * S * 0.36 - c)))


def motif_index(d, t, rng, card):
    """The number as a score: one bar per figure, as tall as the figure,
    repeated until it fills the margin -- a barcode you could read back."""
    figures = [int(c) if c.isdigit() else ord(c) % 10 for c in card.value if c.strip()] or [0]
    x0, step, base = W * S * 0.56, 14 * S, RULE - 46 * S
    n = int((W * S - M - x0) / step)
    for i in range(n):
        f = figures[i % len(figures)]
        h = (f + 1) / 10 * 300 * S
        fill = rgba(t["accent"] if i < len(figures) else t["fg"], 150 if i < len(figures) else 46)
        d.line(((x0 + i * step, base), (x0 + i * step, base - h)), fill=fill, width=4 * S)
    for x in range(M, W * S - M + 1, 24 * S):
        d.ellipse((x - 2, base + 18 * S - 2, x + 2, base + 18 * S + 2), fill=rgba(t["fg"], 70))


MOTIFS = {"math": motif_math, "physics": motif_physics, "cosmos": motif_cosmos,
          "culture": motif_culture, "archive": motif_archive, "index": motif_index}


def hero(value):
    """Where the value goes, as (run, x, baseline) per line: as big as the
    room allows, on one line while that still reads, then two, then three.
    Never abbreviated -- a card that rounds 299792458 is a card about a
    different number."""
    track = -0.025
    avail_w, avail_h = W * S - 2 * M, HERO_FLOOR - HERO_TOP
    best = None
    for n in (1, 2, 3):
        parts = lines_of(value, n)
        runs = [glyphs(p, DISPLAY, 100, 420, track) for p in parts]
        w100 = max(w for _, w in runs) or 1
        top, _ = ink(runs[0][0])
        _, bottom = ink(runs[-1][0])
        h100 = -top + bottom + LEAD * 100 * (len(parts) - 1)
        size = min(avail_w / w100, avail_h / max(h100, 1), 5.6 * S) * 100
        if best is None or size > best[0] * 1.6:
            best = (size, parts)
        if size >= 96 * S:
            break
    size, parts = int(best[0]) // 4 * 4, best[1]
    runs = [glyphs(p, DISPLAY, size, 420, track)[0] for p in parts]
    base = HERO_FLOOR - ink(runs[-1])[1]
    return [(run, M - ink_left(run), base - (len(runs) - 1 - i) * size * LEAD)
            for i, run in enumerate(runs)]


LEAD = 1.02


def ink_left(run):
    """How far the first glyph's ink sits right of its origin: subtracted, so
    a 1 and a 7 both stand on the margin rather than on their side bearing."""
    for _, ch, f in run[:1]:
        return f.getbbox(ch, anchor="ls")[0]
    return 0


def labels(d, img, card, t):
    fg, soft = rgba(t["fg"], 255), rgba(t["fg"], 168)
    # the wordmark, as the header sets it: Newsreader 600, "mb" in the accent
    x = M
    for part, colour in (("Na", fg), ("mb", rgba(t["accent"] if card.room != "culture"
                                                  else t["fg"], 255 if card.room != "culture" else 150)),
                         ("a", fg)):
        run, w = glyphs(part, (SERIF,), 34 * S, 600, -0.02)
        draw_run(d, run, x, M + 16 * S, colour)
        x += w - 0.02 * 34 * S
    run, w = glyphs(card.address, LABEL, 14 * S, track=0.04)
    draw_run(d, run, W * S - M - w, M + 12 * S, soft)

    if card.room == "physics":
        spectrum(img, t)
    else:
        d.line(((M, RULE), (W * S - M, RULE)), fill=rgba(t["fg"], 120), width=S)

    right = glyphs(HOST, LABEL, 14 * S, track=0.04)
    title = " · ".join(card.titles) + (f"  +{card.more}" if card.more else "")
    room = W * S - 2 * M - right[1] - 48 * S
    title = clip_to(title, DISPLAY, 32 * S, room, 500)
    draw_run(d, glyphs(title, DISPLAY, 32 * S, 500)[0], M, RULE + 46 * S, fg)
    draw_run(d, right[0], W * S - M - right[1], RULE + 44 * S, soft)
    kicker = "  ·  ".join(t_.upper() for t_ in card.tags)
    if kicker:
        kicker = clip_to(kicker, LABEL, 13 * S, room, track=0.14)
        draw_run(d, glyphs(kicker, LABEL, 13 * S, track=0.14)[0], M, RULE + 80 * S, soft)


def grain(img, rng):
    """Film grain, seeded like everything else and sparse on purpose: one
    pixel in sixty nudged, because a PNG pays for every pixel that differs
    from its neighbour and a card over 600 KB is one WhatsApp will not draw."""
    noise = Image.frombytes("L", img.size, rng.randbytes(img.size[0] * img.size[1]))
    dark = noise.point(lambda v: 34 if v < 2 else 0)
    light = noise.point(lambda v: 30 if v > 253 else 0)
    img = Image.composite(Image.new("RGB", img.size, (0, 0, 0)), img, dark)
    return Image.composite(Image.new("RGB", img.size, (255, 255, 255)), img, light)


@lru_cache(maxsize=64)
def render(card: Card) -> bytes:
    """The PNG for a card. Pure, so cached on the tuple: an edit is a
    different tuple, and the old picture simply stops being asked for."""
    rng = random.Random(card.seed)
    t = theme(card.room, rng)
    img = Image.new("RGB", (W * S, H * S), t["bg"])
    atmosphere(img, t, rng)
    img = img.convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    MOTIFS[card.room](ImageDraw.Draw(layer), t, rng, card)
    # The motif stops short of the numeral: a knockout, a few pixels wider
    # than the glyphs, so a circle can pass behind 6174 without crossing it.
    lines = hero(card.value)
    knock = Image.new("L", img.size, 255)
    kd = ImageDraw.Draw(knock)
    # and short of the address and the host in their corners, which an
    # outline figure in the culture room would otherwise run through
    kd.rectangle((W * S * 0.55, 0, W * S, M + 30 * S), fill=0)
    kd.rectangle((W * S * 0.55, RULE - 2 * S, W * S, H * S), fill=0)
    for run, x, y in lines:
        for dx, ch, f in run:
            kd.text((x + dx, y), ch, font=f, fill=0, anchor="ls",
                    stroke_width=9 * S, stroke_fill=0)
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), knock))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    for run, x, y in lines:
        draw_run(d, run, x, y, rgba(t["fg"], 255))
    if card.room == "archive":
        stamp(img, t, rng, card)
    labels(d, img, card, t)
    out = grain(img.convert("RGB").resize((W, H), Image.LANCZOS), rng)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True, icc_profile=SRGB)
    return buf.getvalue()
