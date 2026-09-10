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

## Answered: production holds none, and never did

Run against `/data/namba.db` on the box, 2026-09-10, on a read-only
connection (`file:...?mode=ro`, which cannot write, create or migrate):

```sql
SELECT COUNT(*) FROM revisions r
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = r.post_id);
-- 0
```

Two further numbers make it a stronger answer than the count alone:

| | |
|---|---|
| `revisions` where `author = 'deleted'` | 0 |
| `sqlite_sequence.seq` for `posts` | 522, and `MAX(id)` is 522 |

The first is the fingerprint of the route that could create an orphan: it
snapshotted under the literal author `deleted`, and this database has no such
row, so that route never ran here. The second says no id above 522 was ever
handed out, so there is no removed entry hiding past the top of the range
either. The rest of the file: 522 posts, 520 `ACTIVE`, two `DELETED` (110 and
479, both rows present), 36 revisions, and no id missing from 1 to 522.

So the recovery path -- the resurrect branch in `restore_revision`,
`guard_public` letting an absent row through and `PostPage`'s recovery view --
answers for nothing that exists here. It is kept anyway. Nothing in this
codebase can make an orphan, but somebody writing SQL at the file can, and a
partial restore from a backup can; the repository contemplates going behind
the app elsewhere, and this is the way back when it happens. A developer
database already holds five, from before the route that made them was
removed.

What was not kept is the part of that rule which had nothing to do with
recovery. "An absent row passes" also covered an id nobody was ever given, so
`/api/posts/{id}/revisions` and `/comments` answered `200 []` for one -- an
entry exists here and has no history, about an entry that does not exist.
`guard_public` now asks the second question on the absent path: snapshots
behind it and it is the entry the recovery path is for, nothing behind it and
it is a 404. Two decisions had been sharing one condition, and only one of
them was worth keeping.

### The same thing from outside, which agreed

Worth keeping because it needs no access to the box. `guard_public` treats an
*absent* row differently from a hidden one, so for an id that is not live,
`/api/posts/{id}/revisions` says which of three things it is:

| answer | what it means |
|---|---|
| `404` | the row is there, hidden or removed |
| `200 []` | no row and no snapshots |
| `200 [...]` | **no row, snapshots survive** -- an orphan |

Read that way on the same day, `https://namba.chiral.kr` gave 520 live
entries over ids 1 to 522 with exactly two missing, 110 and 479, both
answering `404` -- rows that are there and hidden. Every figure matches the
file. Its controls: a live id answers `200`/`200`, a gap `404`/`404`, and id
99999, which never existed, `404`/`200 []` -- that last being the
absent-passes rule running in production, which is what makes the middle
answer a statement about the row rather than about the route.

Where it is weaker is the top of the range: from outside, "no id above 522 was
ever created" cannot be seen, only "none of the next 38 is an orphan".
`sqlite_sequence` is what settles that, and it needs the file.

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
- 2026-09-10: answered. Read from outside first, then run against the file:
  no orphaned snapshot, no `author = 'deleted'` row, and no id ever handed out
  above the highest live one.
- 2026-09-10: the recovery path kept, and the honesty bug that had been
  sharing its condition fixed separately. An id nobody was ever given now
  answers 404 rather than an empty history.
