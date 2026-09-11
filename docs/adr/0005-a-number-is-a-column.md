# ADR-0005: A number is a column, and a value has one spelling

- Status: accepted, with open items
- Date: 2026-08-18; amended 2026-08-31, 2026-09-02, 2026-09-09

## Context

`/n/42` is every entry filed under 42. If a number were a table, the page
would be a row; as a column, the page is a query, and two spellings of one
number are two pages about one thing with nobody to merge them afterwards.

## Decision

A number is a column, `posts.value`, with `posts.format` deciding how it is
read, sorted and addressed. No `numbers` table.

The stored spelling is locale-neutral: no grouping separators and a dot
decimal. Separators are a display flag, `posts.grouped`; the write form sends
`number_locale` as input grammar and German `1.000,5`, French `1 000,5` and
English `1,000.5` all store as `1000.5`. A grouping pattern that is not strict
(`1,2,3`) is content and is left alone.

An `ABBR` value is stored as typed, case included, and one word is still one
page: the `/a/` reads compare `COLLATE NOCASE`, `head_abbr` canonicalises the
page to the earliest entry's spelling, and the sitemap groups the same way so
its `<loc>` agrees with that canonical. `/a/ufo`, `/a/Ufo` and `/a/UFO` are
one list; none of them rewrites a value to get there.
`ABBR` is Latin letters, digits and `.&/;-` with at least one letter, and is the
one format that is checked rather than taken at its word, because it is a
claim about the value and the claim is a stranger's. `/n/` and `/a/` are two
sections over the one column and an entry has one address.

The value is the one field the wiki's own form will not let a reader retype.
Correcting one is an operator's route, with a snapshot and an audit row.

Text is one Unicode normal form (ADR-0020), which is the same rule one byte
level down.

## Consequences

- `ungroup`, `resolve_format`, `is_abbr` and `canonical_value` together are
  the answer to "which spelling is this value stored as", and every write goes
  through them. The front end's `canonicalNumber` mirrors the grouping half.
- `test_the_two_apps_still_agree` holds the five formats and the index bands
  across both apps.

## Nothing is taken from a value unless something keeps it

That is the line, and it explains both halves rather than listing exceptions.

A grouping separator comes out of the value because `posts.grouped` keeps it
and puts it back: nothing is lost, it moves to a column. A second writer's
`ufo` becomes `UFO` because the first writer's spelling is stored and the word
is not changed by having one of them. Text is folded to NFC because the two
spellings are the same characters (ADR-0020).

Everything else is stored as it was typed, because nothing here would keep
what folding it took away:

| typed | stored | why they are separate pages |
|---|---|---|
| `7`, `007`, `0007` | three values | `007` is a licence to kill, an area code, a flight number |
| `09:41`, `9:41` | two values | `9:41` is how a keynote writes it |
| `10:04PM`, `10:04pm`, `10:04 PM` | three values | the wiki does not decide how somebody writes a time |
| `3.10`, `3.1` | two values | a trailing zero is a precision somebody meant |

They share a sort key, which is what puts them next to each other on the index
rather than on top of each other. `test_a_value_is_stored_as_it_was_typed`
holds all four rows, and holds them as *addresses* rather than as parsing:
each spelling is its own `/n/` page.

## History

- 2026-08-18: a number is a column; five formats.
- 2026-08-19: separators become a display flag, `1,000` and `1000` one page.
- 2026-08-31 (`583d412`): ABBR must be Latin letters; one spelling per word.
- 2026-09-02 (`840619b`): locale-aware input, locale-neutral storage.
- 2026-09-09: the four pairs recorded as an open question, after checking each
  against a fresh database.
- 2026-09-10: answered -- all of them separate, and the rule behind the answer
  written down. No code changed; what changed is that a test now holds it, so
  the next tidy-up cannot fold one of them by accident.
- 2026-09-10: **one spelling per ABBR word is withdrawn.** `resolve_format`
  no longer looks a sibling up and no longer rewrites a value; case is part of
  an abbreviation's spelling, the same as every other format's characters.

  What it cost, measured on production: `DB` (Database, id 306, 2026-09-08)
  was written first, so `dB` (Decibel, id 597, 2026-09-10) stored as `DB`.
  Reproduced on a fresh database, and the second half is the part that decided
  it -- the operator's `POST /api/admin/posts/{id}/value` runs the same
  `resolve_format`, whose lookup excludes only the entry being edited, so
  retyping `dB` was rewritten to `DB` and then refused 409 "that is the number
  it already has". Nobody could file `dB` by any route, including the shell.
  A wiki whose one correcting route cannot correct a value is worse than two
  spellings of one word.

  Withdrawing it costs less than it looked, because the fold was doing work
  two other mechanisms already did. The `/a/` reads were already `COLLATE
  NOCASE` (`main.py`) and `head_abbr` already canonicalised to `rows[0]`
  (`seo.py`), so `/a/dB` and `/a/DB` were already one page with one canonical
  -- the split the fold was defended as preventing did not depend on it. The
  one real leak was the sitemap's `GROUP BY value, fmt`, which is BINARY and
  would have offered a crawler two `<loc>`s for that one page; it groups
  `COLLATE NOCASE` now and takes its spelling from `MIN(id)`, so `<loc>` and
  canonical agree. `SaaS`/`SAAS` and `IoT`/`IOT` are the same case as
  `dB`/`DB` and were always the argument against folding to upper.

  Knock-on, recorded in ADR-0007: `resolve_format` was the only read
  `create_post` decided on, so a create now decides nothing and
  `test_every_write_decides_inside_the_lock` probes eleven routes, not twelve.

- 2026-09-11: a sixth format and a third section, both recorded in ADR-0026.
  `CALENDAR` is a zero-padded `MM-DD` read at `/c/12-25`, and it is the second
  format this record's "nothing is taken from a value" rule reaches by
  *refusal* rather than by leaving the spelling alone: `1-5` cannot be folded
  to `01-05` and nothing would keep the difference, so one day keeps one
  address by the other spellings being a 422. `/n/` is the remainder of the
  three sections now rather than "not ABBR".

- 2026-09-11: **the section joins the value as a field the open form will not
  change**, also in ADR-0026. "A query on a column is an address" above was
  written about the value; with three sections over that column, the format
  decides an address too, so `edit_post` refuses a format that would move an
  entry between `/n/`, `/a/` and `/c/`. The one exception is *into* `/c/`,
  because `parse_number` never returns `CALENDAR` and picking it is the only
  correction an entry filed before somebody noticed it was a date has.
  Correcting the rest stays where correcting a value is:
  `POST /api/admin/posts/{id}/value`, with a name, a snapshot and an audit
  row. Measured first as an index hole rather than as a moved page -- a
  re-filed `UFO` or `12-25` kept its value, lost its sort key and fell out of
  every Integer band.

- 2026-09-11: **"the four that read digits cannot be wrong about it" no longer
  holds for two of them**, recorded in ADR-0027. `INTEGER` and `DECIMAL` are
  the claim that the value reads as a number and are checked for it; `TIME`
  is the one still taken at its word and `MIXED` claims nothing. What is
  unchanged is this record's own rule: the check decides nothing about
  spelling, so `-42`, `1e5`, `1_000` and `٤٢` all read and all stay as typed,
  two spellings sharing one sort key.
