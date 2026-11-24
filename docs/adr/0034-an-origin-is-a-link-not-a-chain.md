# ADR-0034: An origin is one link, and a chain is never stored

- Status: accepted
- Date: 2026-11-24

## Context

The wiki says what numbers mean. Names have the same kind of story and no
place to tell it: 1Q84 is 1984 with a Q for the 9, Radiohead is a Talking
Heads song, Python is not the snake. These are not etymology entries. They
are how a proper noun came to be called that, and they connect: JavaScript
borrowed from Java, which was named after a coffee, which was named after an
island.

A post could not hold one. A post is a value and what it means, filed at an
address that is a query on `posts.value`. An origin is two names and what
happened between them, and it belongs to both.

## Decision

Origins is a seventh tab and its own table. `origins` holds one link per row:
`name` came from `origin`, with `body` telling how when somebody knows
(the story is optional, stored empty rather than null), a short note on each side
saying what the name is the name of, a nickname and the language the story is
written in.

- **Nothing stores a chain.** A chain is rows that meet because one row's
  origin is another row's name. It is joined in the browser (`origins.ts`),
  and it grows when somebody files the next link. This is the argument that
  made a number a column and not a table, applied to names.
- **Names are compared case-folded and stored as typed**, the way `/a/` reads
  an abbreviation.
- **A name with two origins is two rows.** So is the same link told twice,
  which is how a second language arrives. The list draws one telling per
  (name, origin) pair, the reader's language first. There is no translations
  table for origins.
- **A loop is refused by the write that would close it.** `store.leads_back`
  walks every live link inside `db.writing`, for the public create and for an
  operator putting a hidden link back.
- **A published chain is a loop over one route.** `POST /api/origins` takes
  one link. Each link is true on its own, so half a chain is still a list of
  true things and no batch route is needed.
- **Hiding is the whole of moderation**, as it is for a post: `status` uses
  `POST_STATUSES`, the operator's route is its own undo, and
  `admin.py purge-origin` is the hard delete for the removal a law requires.
- **No free-form relation kind.** Homage, eponym, pun and the rest were in the
  prototype and came out: the story says which, and a fixed list would have
  been one more vocabulary to copy between the apps by hand.

## Consequences

`GET /api/origins` answers the whole live table, because a chain can only be
drawn from all of its links. That is fine at hundreds of rows and is the
first thing to revisit at thousands; the answer then is the server joining
chains, not paging links.

A link's words can be edited through the public API and its two names cannot:
the names are the link. `origin_revisions` keeps what each edit replaced, so
an edit is not a loss, and the edit form lists them with a Restore beside
each. A link filed under the
wrong name is hidden by an operator and filed again.

Origins are outside the header search, the sitemap, the server-written
`<head>`, `/api/contributors`, the dashboard's counts and the delete-request
and report queues. Each of those reads `posts`. A link's comments and flags
live in `origin_comments` and `origin_flags`: `comments.post_id` is a foreign
key on `posts`, and `reports.post_id` and `delete_requests.post_id` are read
by id all over the back office, so an origin's id in any of the three would
be mistaken for an entry's. Both kinds of flag are one table, read and closed
on the Origins page. Both tables cascade, so `purge-origin` takes the words
that asked for the purge with the link, where an entry's are blanked and
kept.

Twenty public routes write now — the create, the edit, the restore, a like
and its undo, a comment, a report and a removal request — and nineteen of
them decide (ADR-0007).

## History

- 2026-11-24: the first version of this record had no edit at all, on the
  ground that nothing snapshotted a link. The requester asked for an Edit
  shaped like an entry's the same day, so the snapshot was added instead:
  `origin_revisions`, written by `edit_origin` before it writes the row.
