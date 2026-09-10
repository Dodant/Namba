# ADR-0025: A queue is worked without leaving it

- Status: accepted
- Date: 2026-09-10

## Context

The moderation queues answered the wrong half of the question. `Reports` listed
how many people had objected to an entry and what reasons they gave; `Delete
requests` listed the reason and the prose. Neither showed the entry, and the
entry is the thing being decided about — "somebody says this is their phone
number" is not a decision until you have read what the entry says.

So the honest path through a decision was: read the row, open the entry on its
own page, read it, press Back, find your place in the list again, press the
button. Five moves, three of them navigation, and the middle one loses the
queue: `Reports` at fifty rows a page is a scroll position an operator has to
rebuild by eye. What actually happened instead is that decisions were made off
the reasons alone, which is the failure this had been designed against.

The rule in `Namba-frontend/CLAUDE.md` said "one entry is a page, not a
drawer", and the reason it gave was sound: the diff needs the width, and a
page can be sent to somebody. Both are still true. What the rule got wrong was
treating *reading an entry to decide about it* and *studying an entry's
history* as one thing that needs one place.

Two smaller costs sat beside it. Twenty spam entries under twenty numbers, the
shape an advert actually takes here, came off the wiki in twenty page loads.
And a client hash was drawn on eight tables and led nowhere, so the question
it exists to raise — is this the same person as that one — had no answer
outside the abuse page's window.

## Decision

**A queue row opens the entry beside the reasons, in a drawer, and the
decision is taken there.** `EntrySheet` in `src/admin/sheet.tsx` is that
drawer, used by `Reports`, `Requests` and `Content`. It costs no new route:
`GET /api/admin/posts/{id}` already answered with the body, the reports, the
requests and the comments.

**The page stays, and keeps the diff.** `/content/:id` is unchanged and still
the linkable thing; the drawer's last section links to it. The split is by
question, not by entry: deciding is the drawer, studying is the page.

**The drawer steps.** `useQueue` in `state.ts` holds a position rather than an
id, so a decided row drops out of the list and the index it vacated is the
next item — the queue advances by itself, and the list is reloaded without
being blanked so the sheet does not close and reopen underneath. Both ends
stop rather than wrap.

**Arrow keys and Enter, nothing else.** `↑↓` / `jk` move, Enter opens, Escape
closes. No single key is a decision: every one of those is still a button
somebody has to aim at, and a destructive one still asks.

**Bulk status changes are a client-side loop, not a route.** The audit log
wants a row per entry whatever happens, so a batch route would only save round
trips — and fifty of those against one SQLite writer is a queue with extra
steps. A 409 ("already HIDDEN") is counted, not raised.

**A client hash is a link into the log.** `GET /api/admin/activity` gained
`action`, `admin_id`, `ip_hash`, `target_type`/`target_id` and `hours`, and
the route's `kind` can be widened from the URL — so "everything this address
did" and "everything that happened to entry 42" are the one log read two more
ways rather than two pages nobody built.

## Consequences

The drawer is modal, so the list under it is inert: another row is reached
with `↑↓` or by closing, not by clicking past the sheet. That is the right
trade for a queue and the wrong one for browsing, which is why `Content` keeps
its title links to the page.

Four of the five new log filters lead an index (`idx_events_target`,
`idx_events_ip`, `idx_events_since`). `action` scans, which at a row per write
is the cheap one to lose.

The bulk loop's ceiling is a page of rows — fifty. Beyond that it is a real
batch route, and the comment in `Content.tsx` says so.

## History

- 2026-09-10: built. Reversed the "not a drawer" half of the panel rule from
  ADR-0016, which stands otherwise — the panel still has no editor of its own
  and the number is still the one field it corrects.
