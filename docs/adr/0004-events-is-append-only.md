# ADR-0004: `events` is append-only, and a purge does not reach it

- Status: accepted
- Date: 2026-08-20; amended 2026-09-09

## Context

An audit log an operator can tidy up after themselves in is not one. The same
table is also the wiki's recent-changes feed and the raw material for spotting
a spammer, so it holds every visitor's write with three salted hashes.

## Decision

Nothing in this codebase issues an `UPDATE` or a `DELETE` against `events`,
by convention rather than by trigger. `admin.py purge` leaves an entry's event
rows in place: the nickname typed, the three hashes and whatever `meta` holds.
There is no retention sweep on the hashes.

Because `meta` cannot be reached by a purge, content does not go in it.
Decision notes are the one exception and the rule is an operator's: the data a
removal is for does not go in a decision note.

A request that raises leaves an `ERROR` row carrying the exception's type, the
route's pattern and the file and line — never the message and never the path
as typed, both of which can quote what a stranger wrote. `kind=anon` excludes
these rows and so does the dashboard's `writes_1h`; `kind=all` shows them.

## Consequences

- A legal removal does not reach everything about an entry. Weighed and
  declined: a wiki this size gets more out of a log nobody can edit.
- Revising this means saying so here first.

## History

- 2026-08-20 (`4399f72`): the rule, and the price purge pays for it, written
  down together with the back office.
- 2026-09-09 (`733d871`): purge blanks `delete_requests.detail` and
  `reports.detail`, since a removal request usually restates the very thing it
  asks to have removed. The rows stay.
- 2026-09-09 (`f689c7d`): `ERROR` rows. The case that argued for them was a
  backslash in a title: `re.sub` read the title as a replacement string,
  raised on the group reference, and answered that page with a 500 that
  nothing recorded until somebody happened to type one.
