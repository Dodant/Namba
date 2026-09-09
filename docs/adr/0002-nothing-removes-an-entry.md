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

## Open

Whether production holds any snapshot whose entry row is gone. One query:

```sql
SELECT COUNT(*) FROM revisions r
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = r.post_id);
```

Zero, and the resurrect branch in `restore_revision`, `guard_public`'s
absent-passes rule and `PostPage`'s recovery view can go together. Non-zero,
and they stay; `revisions.author = 'deleted'` on the last snapshot of each is
the fingerprint of the route described below, so a count with none of those
came from something else and is a different question.

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
