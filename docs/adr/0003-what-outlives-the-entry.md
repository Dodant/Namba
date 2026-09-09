# ADR-0003: Revisions, requests, reports and events outlive the entry; comments and links do not

- Status: accepted
- Date: 2026-08-20

## Context

SQLite foreign keys with `ON DELETE CASCADE` are the easy way to keep tables
consistent, and on this wiki they are also the way to lose the one thing that
stands between vandalism and permanent loss.

## Decision

No foreign key on `revisions`, `delete_requests`, `reports` or `events`. A
snapshot must outlive the entry it describes; a request or report is the
record that somebody asked and an operator decided, which is worth having
after the entry is gone; an event is the record of what happened to a thing.

`comments`, `post_links`, `post_tags` and `translations` reference `posts(id)`
and cascade. Talk beside an entry has nothing to recover, and the cascade is
for `admin.py purge`, where taking it along is the point. Hiding an entry fires
nothing: the rows stay and come back with it.

Comments are never snapshotted. `snapshot()` reads through `fetch_one()`, so
anything attached there rides into every later revision.

## Consequences

- `admin.py purge` deletes snapshots by hand before the row, since no key
  will.
- A resurrected entry (ADR-0002) is the entry, its tags and its translations,
  and no comments and no links.
- The admin lists that join `posts` do so with `LEFT JOIN`: a request or an
  audit row about a purged entry is exactly the row somebody goes looking for.

## History

- 2026-08-18: `revisions` shipped without a foreign key.
- 2026-08-20: the back office added `events`, `delete_requests` and `reports`
  on the same rule, and `comments` on the opposite one, on purpose.
