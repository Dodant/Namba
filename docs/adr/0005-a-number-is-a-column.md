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

An `ABBR` value has one spelling, the first writer's: a later writer of the
same word, in any case, adopts what is stored, and `/a/ufo` lands on `UFO`.
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
