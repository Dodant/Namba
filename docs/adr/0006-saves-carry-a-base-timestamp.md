# ADR-0006: A save carries the entry as the sender last saw it

- Status: accepted
- Date: 2026-09-09

## Context

The edit form fills itself from the entry and sends every field back, so a
save is a read-modify-write with a person-sized gap in the middle. Two people
who open `/p/42/edit` a minute apart both hold a complete copy, and without a
check the second to press Publish writes their copy of the fields they never
touched over the first one's edit, with no error anywhere. No other defence on
the wiki reaches it, because the loss is a write.

## Decision

`PATCH /api/posts/{id}` takes `base_updated_at`, the entry's `updated_at` as
the sender last saw it, and answers 409 if the entry has moved since — what
MediaWiki calls `basetimestamp`. The check is the last clause of the `UPDATE`
itself, inside the transaction that took the snapshot, so a refused save leaves
no revision claiming somebody replaced the entry.

The base is optional. This is an open API with no key, and requiring a read
before every write would charge every `curl` for a problem the form has. The
form always sends it.

## Consequences

- Timestamps are whole seconds, so two saves inside one second still race.
  What this catches is the gap that loses work, not the one that needs a
  thread scheduler.
- The refusal is detected and not yet resolved: the form shows the 409 and
  tells the reader to reload, which discards their draft. Keeping the draft,
  showing what changed and re-applying it is the next step.

## History

- 2026-09-09 (`74c4f72`): introduced, with `test_two_editors_do_not_undo_each_other`.
