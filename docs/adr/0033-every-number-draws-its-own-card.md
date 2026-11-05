# ADR-0033: Entries and value pages draw their own share card

- Status: accepted
- Date: 2026-11-05

## Context

Every pasted Namba link unfurled as the same picture, `public/og.png` (ADR-0011).
No entry has an uploaded image, so the fallback was what every share looked
like: a link to `/n/42` and a link to `/c/12-25` drew the same card, and the
only thing that told them apart was the title text beside it.

A picture per entry has to be drawn by the server. Scrapers do not run
JavaScript, and Facebook, X, Slack, KakaoTalk and iMessage all refuse SVG for
`og:image`, so the card has to be a raster. This app had no image code and no
dependency that drew one.

## Decision

`og_image.py` draws a 1200×630 sRGB PNG with Pillow, served at
`/og/p/{id}.png` and `/og/{n|a|c}.png?v=`.

- **Pillow is the one new dependency.** It is the smallest thing that sets
  type in Python. A headless browser or a Node/Satori service would be a second
  runtime beside an app whose image is one Python process (ADR-0008).
  The faces are the site's own: Newsreader, IBM Plex Mono and Gowun Batang,
  plus Noto Serif for Greek and operators. They ship as subset WOFF2 in
  `Namba-backend/fonts/`, about 780 KB in all. Gowun Batang is 8 MB as TTF
  and 477 KB as WOFF2, and Pillow's wheels read WOFF2 on macOS and on the
  `python:3.11-slim` image (checked in Docker on this date).
- **Pure and seeded.** A card is a function of a tuple built from the live row,
  so nothing is stored and a hidden entry has no card. The seed is the section
  and the value, so one number is one picture wherever it appears. The URL
  carries a digest of the tuple, which changes the address when the content
  changes. The response caches for a day, because hiding does not change the
  address.
- **Drawn only for what exists.** An empty value page keeps the static file.
  `/n/` is an open set, and a render per typed address would turn every
  stranger's URL into CPU time. On a failure the routes answer with the static
  card rather than an error.
- **Six rooms, one system.** A card is drawn in one of six rooms: math, physics,
  cosmos, culture, archive or index. The room comes from the tags, and from the
  format when no tag maps to one. Each room changes the background and the
  generative motif. The type, the margins, the label under the rule and the
  wordmark stay the same in all six.

## Consequences

- A render costs 60–200 ms of CPU, measured on an M-series laptop, and about
  350 ms under emulation in Docker. `render()` keeps the last 64 cards. A
  scraper walking every entry in every locale costs minutes of CPU, not an
  outage. A disk cache keyed on the digest is the next step if that changes.
- Cards are 100–470 KB. The physics room's wavefronts are the heaviest. Grain is
  one pixel in sixty, because WhatsApp stops drawing previews somewhere past
  600 KB, and a test holds that ceiling.
- Two more public reads carry `LIVE`, and `test_hidden_is_invisible` walks both.
- A crash inside `render()` is printed and answered with the fallback, so it
  does not reach the `ERROR` row in `events` (ADR-0004). The trade is
  deliberate: a scraper never retries, and a broken image is worse than the
  generic card.

## History

- 2026-11-05: the card's host changed from `site_base(request)` to a fixed
  `HOST`, after a security review found two problems. A forged `Host` header
  was printed on a card served with public caching. Each new header was also
  a new cache key, so a client could force a fresh render every time.
