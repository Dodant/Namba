# ADR-0019: An entry's picture is one of this wiki's uploads

- Status: accepted
- Date: 2026-09-09

## Context

`posts.image` is drawn straight into an `<img>` on the entry page and every
card. A value that is an outside URL is a tracking pixel fetched by every
reader of that entry, on a wiki whose footer promises not to store addresses.
It also hands `og_head` a path it builds a broken `og:image` from.

## Decision

`image` is a name under `/uploads/` with an extension the upload route accepts,
and nothing else: `PostRules.own_upload` holds it to `UPLOAD_PATH` on both
writes. `null` still clears a picture. A restore does not re-check, since a
snapshot has to be restorable whatever it holds. The same character class
`gc_uploads` scans for, the same extensions `/api/upload` allows.

## History

- 2026-09-09 (`bd14d24`): `image` had taken any 300-character string. Checked
  against a fresh database with `https://tracker.test/pixel.gif`, which was
  stored and echoed.
