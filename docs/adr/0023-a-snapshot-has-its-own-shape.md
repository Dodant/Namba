# ADR-0023: A snapshot has its own shape

- Status: accepted
- Date: 2026-09-10

## Context

`snapshot()` stored `json.dumps(fetch_one(...))`. One dict was therefore three
things at once: the single-post API response, the format `revisions` holds,
and the input `restore` reads. Adding a key to the view added it to the
storage format, silently, for every snapshot taken from then on — in the one
table nothing rewrites and no migration can reach, since a snapshot is what a
restore is measured against.

`CLAUDE.md` already warned about exactly this for comments ("its own endpoint
rather than a key on `fetch_one` — anything attached there rides into every
revision taken afterwards"). The warning was the only thing holding it.

## Decision

`store.SNAPSHOT_FIELDS` names the columns a revision keeps, and
`snapshot_of()` builds the dict: those fields, the tags, the translations, and
nothing else. `snapshot()` stores that.

Three columns are out. `id`, because `revisions.post_id` is what says which
entry a snapshot is of. `status`, because hiding is not content — hiding takes
no snapshot and a restore must not put a hidden entry back on the wiki.
`bucket`, because it is computed from the format and sort key beside it.

`edited_by` and `updated_at` are in and are not read back. A snapshot is the
entry *as it was*, and a version that cannot say who last touched it is a
worse record for the sake of two columns.

## Consequences

- The single-post view can grow without changing what is stored.
- Snapshots written before this carry `id`, `status` and `bucket`, and always
  will: nothing rewrites `revisions`, which is the point of the table
  (ADR-0003). `apply_snapshot` reads what it needs by name and ignores the
  rest, so they restore exactly as they did.
  `test_a_snapshot_written_by_an_older_version_still_restores` is the only
  thing in the suite that can produce one of those rows now, and it exists to
  keep that true.
- `test_a_snapshot_is_its_own_shape` asserts the key set literally. Adding a
  field to `fetch_one` must not change it; adding one to `SNAPSHOT_FIELDS` is
  a decision, and the test is where it is made in the open.

## History

- 2026-08-18: `snapshot()` stored `fetch_one`'s dict.
- 2026-09-10: named. Nothing had gone wrong yet; the shape was one careless
  key away from being wrong for good.
