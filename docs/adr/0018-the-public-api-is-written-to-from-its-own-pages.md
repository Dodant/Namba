# ADR-0018: The public API is readable from anywhere and written to from its own pages

- Status: accepted
- Date: 2026-09-09

## Context

Every guard on the open half counts per IP hash and assumes an attacker has
few addresses. A page on another site that writes to this API through its
visitors' browsers holds every one of their addresses, twenty writes a minute
each, and a block aimed at it lands on the visitors.

A browser has two ways to send a cross-origin write. A JSON body carries a
content type that forces a preflight. A body with no content type, or a
multipart form, is a "simple request" and never preflights; FastAPI parses a
body with no content type as JSON.

## Decision

`CORSMiddleware` keeps `allow_origins=["*"]` and grants only `GET`, `HEAD` and
`OPTIONS`, so a write's preflight is answered 400. `guard`, the dependency on
every public write, refuses `Sec-Fetch-Site: cross-site`, which every current
browser attaches and no other client does. `same-site` passes, so a page on
`chiral.kr` may write to `namba.chiral.kr`.

A client that is not a browser sends neither a preflight nor the header and is
unaffected. The API stays open and keyless.

## Consequences

- Credentials stay off, as before: the admin session rests on
  `SameSite=Strict` and on the browser refusing a credentialed request against
  `*`. A refused write preflight is not a third layer for the admin session.
- `test_cross_site_writes_are_refused` holds both layers.

## History

- 2026-08-18: `allow_methods=["*"]`, on the reasoning that an open wiki's API
  should be readable from anywhere. Readable and writable had not been
  separated.
- 2026-09-09 (`d4694f4`): a preflight from a foreign origin was answered 200
  and a foreign `POST` 201 in a test client; both layers added.
