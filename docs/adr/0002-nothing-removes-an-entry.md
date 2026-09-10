# ADR-0002: Nothing removes an entry; purge is a shell command

- Status: accepted
- Date: 2026-08-20

## Context

A wiki anyone can edit is a wiki anyone could empty. A delete button behind a
confirmation is still one click from loss, and with no accounts there is
nobody to hold to the click.

## Decision

`posts.status` is `ACTIVE`, `HIDDEN` or `DELETED`. A hidden entry drops out of
every public read — eight API reads, four server-written heads and the sitemap
— and comes back whole: history, comments, translations, at the same address.
There is no `DELETE /api/posts/{id}` (the path answers 405) and no delete
control anywhere in the front end. Hiding is what moderation means, and a
reader who thinks an entry should go files a delete request that an operator
decides.

The one hard delete is `admin.py purge <id> --yes`, in the shell, for the
removal a law requires. It takes the entry, its snapshots, its picture and the
free text of any request or report about it, and leaves the entry's rows in
`events` (ADR-0004).

## Consequences

- Moderation is reversible at no cost: the undo of a hide is the same column.
- `test_hidden_is_invisible` walks every public read. A new public read that
  touches `posts` joins that list or leaks what an operator took down.
- `restore_revision` keeps a branch that puts an entry back when its row is
  gone — a state no code in this repository can produce. It stays until the
  query below has been run against production.

## Answered: production holds none

The question was whether production has a snapshot whose entry row is gone.
It has none, so the recovery path -- the resurrect branch in
`restore_revision`, `guard_public`'s absent-passes rule and `PostPage`'s
recovery view, 64 lines between them -- answers for nothing that exists and
may go. That has not been done yet; it is a removal to take on purpose rather
than as a footnote to a measurement.

The query the answer was meant to come from needs the file, which is on the
box:

```sql
SELECT COUNT(*) FROM revisions r
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = r.post_id);
```

It was answered from outside instead, through the public API, which can see
the same thing because `guard_public` treats an *absent* row differently from
a hidden one. For an id that is not live, `/api/posts/{id}/revisions` says
which of three things it is:

| answer | what it means |
|---|---|
| `404` | the row is there, hidden or removed |
| `200 []` | no row and no snapshots |
| `200 [...]` | **no row, snapshots survive** -- an orphan |

Measured 2026-09-10 against `https://namba.chiral.kr`: 520 live entries, ids
1 to 522, and exactly two ids missing from that range, 110 and 479. Both
answer `404` on the revisions route, so both are rows that are there and
hidden. Nothing in 523-560 either, which is where an orphan would sit if the
newest entries were the ones removed -- those leave no gap to notice.

Three controls, without which the reading means nothing: a live id answers
`200`/`200`; a gap answers `404`/`404`; id 99999, which never existed,
answers `404`/`200 []`. The last is the absent-passes rule running in
production, and it is what makes a `404` on the middle row a statement about
the row rather than about the route.

If the recovery path is removed, note that a developer database may hold
orphans that this measurement does not cover -- this one had five on
2026-09-09 -- and those become unreachable.

## History

- 2026-08-18 (`b6fac29`): the wiki shipped with `DELETE /api/posts/{id}` and a
  Delete button on every entry page. The route snapshotted the entry under the
  literal author `deleted` and dropped the row; `194aba9` the same day let such
  an entry be restored from its own page, which is where the resurrect branch
  comes from.
- 2026-08-20 (`dc5a6d1`): the status column replaced deletion. The route and
  the button were removed.
- 2026-09-01: the first Dockerfile and deploy workflow. Nothing that could
  orphan a snapshot ever ran anywhere but a developer's machine, whose
  `namba.db` held five such snapshots on 2026-09-09. Whether production's
  database began as a copy of that file is the open question above.
- 2026-09-09: the recovery path measured at 64 lines across the three places
  named above, and kept pending the query.
- 2026-09-10: the query answered, from outside. Production holds no orphaned
  snapshot, which unblocks removing the path; the removal itself is still to
  be decided.
