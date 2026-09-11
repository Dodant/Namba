# ADR-0026: A fixed calendar date is a format, and a third section

- Status: accepted
- Date: 2026-09-11

## Context

Christmas, April Fools and Bastille Day are numbers this wiki had no way to
file. A date with no year could only be typed as `MIXED` — `12/25` — which
carries no sort key and no band (ADR-0005), so it landed in one flat
alphabetical list beside `9¾` and `80/20` with nothing saying which month it
was in. Asked for as a **Calendar** tab: twelve foldable months, January to
December, with the month it is now already open.

Three things had to be settled before any of it could be built: whether a date
is a format or a column, whether it is read at `/n/` or somewhere of its own,
and what its stored spelling is.

## Decision

**A format, `CALENDAR`, the sixth.** `posts.format` is already the one thing
that decides how a value is read, sorted and addressed, which is the argument
that made `ABBR` a format rather than a `kind` column, and it lands the same
way here: a second column would have been a migration, a second hand-copied
vocabulary and a branch beside every existing one.

**A third section, `/c/12-25`.** `/n/` and `/a/` became `/n/`, `/a/` and
`/c/`. A date is not a magnitude and there is no number 12-25 for `/n/12-25`
to be a page about, so filing one there is the mistake ADR-0005 names one
level up — a page short of the thing it is about. `section_where()` is still
the only condition that tells them apart, and `number` is now the remainder
(`format NOT IN ('ABBR', 'CALENDAR')`) rather than a listed arm, so a seventh
format added without a thought about sections lands at `/n/`, which is the
safe side. `section_of()` and `section_sql()` are the same three names read
the other way, for `value_path()` and for the sitemap's grouping.

**The stored value is a zero-padded `MM-DD`, and the other spellings are
refused rather than folded.** `1-5` is not rewritten to `01-05`: ADR-0005 says
nothing is taken from a value unless something keeps it, and nothing here
would keep that difference, so refusing is what is left if one day is to have
one address. That makes `CALENDAR` the second format that is *checked* rather
than believed — like `ABBR` it is a claim *about* the value and not a way of
reading one, and with no login the claim is a stranger's. `02-30` and `13-01`
go the same way; `02-29` is accepted, because a leap day is a fixed date and
there is no year here to disagree with it.

**The sort key is `month * 100 + day`** — 1225, 401, 229 — the exact analogue
of `TIME`'s minutes past midnight. `date_key()` in `numfmt.py` is both the
check and the key, because they are one question, and `bucket_of` takes the
month back out of it for the band.

**`parse_number` does not guess at it.** `12-25` is Christmas and `80-20` is a
ratio, and nothing in either string says which — the same ambiguity that keeps
`11:11` and `1:29:300` apart, answered the same way: the format is reached by
picking it. `test_parse` pins `12-25` and `02-29` as `MIXED` suggestions so
that stays true.

**The section is closed at both ends, and it is the only one that is.**
`/n/` and `/a/` are open sets: `/n/999999` and `/a/QQQ` are values nobody has
written about *yet*, and an empty page there is a real page inviting the first
entry. A day of the year is 366 addresses, so `/c/99-99` is not an empty date
— it is not a page, and `index_html` falls it through to the same noindex
head every mistyped path gets, with no canonical claiming it exists.
`CalendarPage` in `App.tsx` asks `monthDay` at the same boundary and draws the
`*` route's own "Nothing here", so the `<head>` a crawler reads and the page a
reader sees agree. Left open, the empty page offered "Give it a meaning" and
the link carried the unreadable value to the form, which cannot read it back
and starts from today — so the reader who asked for `99-99` filed the entry
under this morning.

**And an entry filed as a date stays one.** `edit_post` refuses a format that
would take a `CALENDAR` entry out of `/c/`. A section is an address, and the
open form does not change addresses — it will not let the value be retyped for
exactly this reason (ADR-0005), and `POST /api/admin/posts/{id}/value` is the
route that can, with a name, a snapshot and an audit row behind it. The check
reads the format the route has *settled*, not the one that was sent, so an
edit carrying only a value is the same refusal: `12-25` does not re-derive as
a date, so re-deriving is the same move made quietly. Re-filing *into* the
section stays open, because picking Calendar for a `MIXED` `04-01` is how a
misfiled date is corrected. `ABBR` needs no equivalent — `UFO` re-derives to
`ABBR`, so nothing drops it out of `/a/` by accident.

**`resolve_format` stays pure.** No "is this date taken" lookup: a create
decides nothing about another row, which is what lets it be the one write with
no deciding read to hold the lock over (ADR-0007).

**The value is picked, not typed.** Two real `<select>`s on the create form,
the day list following the month, the day clamped when the month shrinks. A
text box would have been a way to type `13-40` and read a 422 about it.

**It reads in the interface locale and is stored locale-neutral.**
`Intl.DateTimeFormat` gives "December 25", "25. Dezember" and "12월 25일" in
all seven locales for nothing, so there is no thirteenth row in `m.buckets`
and no month-name table. `showValue()` takes the format to decide it, asked
off the row and never guessed from the characters, because a `MIXED` `12-25`
is a different entry about a different thing.

## Consequences

- Two hand-copied rows move: `FORMATS` gains a sixth member in the same
  position on both sides, and `MONTH_BUCKETS` in `api.ts` is a third band list
  compared as a set against `bucket_of` in both directions (ADR-0009).
- Fourteen public reads carry `store.LIVE` rather than thirteen;
  `head_calendar` is the new one and `test_hidden_is_invisible` walks it.
- `seo_locale.TEXT` gains `calendar_lead` and `post_calendar` in all seven
  locales, and `post_summary` takes the section's noun rather than a bool.
- `m.common.subject` and `m.browse.summary` take a section rather than a bool,
  so a band under December counts dates and not numbers.
- The **Calendar tab is the one index that draws an empty band.** Twelve
  months are a calendar; a year missing August reads as a bug rather than as a
  month nobody has written about. Every other tab still hides a band with no
  rows.
- Three things were weighed and left out. **Localized month names
  server-side**: the `<head>` says `12-25` inside a localized sentence, because
  rendering the date there means twelve month names in seven languages — 84
  strings in a 198-line file — to agree with a line the client already draws
  from `Intl`. **A month with no day** (`10-00`, "October"): not asked for, and
  it needs its own band, sort and display rules. **A "today" view**: the
  current month opening is the whole of the date-awareness here.
- **Re-filing a date as `INTEGER` was one click from the public form, and it
  took the entry off the index.** `store.resolve_format` swallows `float()`'s
  `ValueError` for an explicit `INTEGER`, so the entry kept `12-25` and lost
  its sort key; `bucket_of` then has no band to give. Three of the six tabs
  fill a fixed band list with `rows.filter(n => n.bucket === b)` — Integer,
  Abbreviation and Calendar — and Integer is the only one that can be handed a
  row with no band at all, because `is_abbr` and `date_key` guarantee the
  other two one. So the entry answered at `/n/12-25` and under no band: on the
  wiki and on no page. The shape predates this branch
  (`UFO` re-filed as `INTEGER` does it too) and the section lock does not
  reach all of it: `POST /api/posts` with `{"value": "9 3/4", "format":
  "INTEGER"}` still strands one. Closing that means either checking the four
  formats that are currently taken at their word, or giving the Integer tab a
  band for the leftovers — a decision, not an oversight, and not this one.
- The back office keeps the stored spelling everywhere, deliberately. One of
  the places it draws a value is the field an operator retypes it in, and an
  operator judging or correcting a value wants the characters that are stored —
  the same argument that shows them a body as source.

## History

- 2026-09-11: decided and built. The three questions above were put to the
  requester before anything was written; the answers were the fuller option
  each time — its own section rather than `/n/`, all twelve months rather than
  only the ones with entries, and a localized reading rather than the stored
  `MM-DD` on screen. The section lock and the closed `/c/` came out of the
  pre-merge review the same day: both were reachable from the finished branch
  and neither had been asked about, so they are decisions above rather than a
  later entry here.
