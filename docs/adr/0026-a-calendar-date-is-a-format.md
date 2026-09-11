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
- The back office keeps the stored spelling everywhere, deliberately. One of
  the places it draws a value is the field an operator retypes it in, and an
  operator judging or correcting a value wants the characters that are stored —
  the same argument that shows them a body as source.

## History

- 2026-09-11: decided and built. The three questions above were put to the
  requester before anything was written; the answers were the fuller option
  each time — its own section rather than `/n/`, all twelve months rather than
  only the ones with entries, and a localized reading rather than the stored
  `MM-DD` on screen.
