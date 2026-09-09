# ADR-0011: The server writes every page's `<head>`

- Status: accepted
- Date: 2026-08-31 (share card); the head itself since 2026-08-19

## Context

No crawler runs the JavaScript that would set a title, and a share of an entry
has to arrive with that entry's title, blurb and picture in the markup. The
only process holding the entry is the API.

## Decision

The API serves the built front end, and `seo.index_html()` writes the head
per request: `/`, `/guide`, `/n/{value}`, `/a/{value}`, `/t/{tag}` and
`/p/{id}` get titles, descriptions, canonicals, Open Graph tags and JSON-LD;
everything else is `noindex`. Being indexable is what has to be spelled out.
`/robots.txt` and `/sitemap.xml` come from the same process and name the
address the request arrived at. Every page falls back to one share card,
`public/og.png`, held at 1200×630 by a test.

Server-written metadata follows the interface locale, chosen from the
`namba_ui_locale` cookie and then `Accept-Language`. Entry content is never
translated by that choice.

## Consequences

- The document varies on `Cookie`, and every visitor carries a `namba_cid`, so
  no shared cache can hold it. A CDN or `proxy_cache` in front of this must
  bypass the document and cache `/assets/` alone, which is already immutable.
  The ways out are a locale in the path, which trades away the locale-neutral
  canonical, or taking the cookie out of the server's decision and letting
  `Accept-Language` alone choose. Neither is taken; nothing caches yet.
- API `GET`s carry no cache headers either. They read no cookie and could.

## History

- 2026-08-19: the catch-all serves `dist/` and writes `og:` tags for `/p/{id}`.
- 2026-08-31 (`756831b`): a page with no picture pastes as the site's card,
  not a grey box.
- 2026-09-02 (`40597fc`): metadata localised by interface locale.
- 2026-09-09 (`aa96874`): the head moved out of `main.py` into `seo.py`.
