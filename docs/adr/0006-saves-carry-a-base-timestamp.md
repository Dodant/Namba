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
- The refusal keeps the reader's work. `PostForm` catches the 409, refetches
  the entry, moves the base on to it and names the fields that moved; the
  draft is untouched and a second press applies it over theirs.

## Open

It does not merge. The form sends every field on every save, so two people
editing different fields of one entry still collide, and the second one's
press overwrites the first's field with the copy they loaded. Sending only
the fields the form actually changed would let both land -- and would also
change what a save means, from "the entry is now this" to "these fields are
now this", which is a decision rather than a refinement. Worth taking
deliberately, with the resurrect branch's own open question (ADR-0002) as the
model: written down, then answered.

## History

- 2026-09-09 (`74c4f72`): introduced, with `test_two_editors_do_not_undo_each_other`.
- 2026-09-09: the front end stopped answering the 409 by telling the reader to
  reload, which discarded the draft. `ApiError` carries the status now, which
  is what lets one refusal be told from another.
