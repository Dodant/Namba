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

## Open

The rule is applied to separators, to ABBR case and to normal form, and to
nothing else. These pairs are separate pages today, and no decision has been
taken about them:

| typed | stored | note |
|---|---|---|
| `7`, `007`, `0007` | three values | `007` may be a different number from `7` |
| `09:41`, `9:41` | two values | `9:41` is how the keynote time is written |
| `10:04PM`, `10:04pm`, `10:04 PM`, `22:04` | four values, one sort key | |
| `3.10`, `3.1` | two values, one sort key | |

Deciding which of these are identity and which are content is the next step
for this record, and the decision belongs in `numfmt.py` as one function and a
table of cases rather than in four regexes.

## History

- 2026-08-18: a number is a column; five formats.
- 2026-08-19: separators become a display flag, `1,000` and `1000` one page.
- 2026-08-31 (`583d412`): ABBR must be Latin letters; one spelling per word.
- 2026-09-02 (`840619b`): locale-aware input, locale-neutral storage.
- 2026-09-09: the open list above recorded, after checking each pair against a
  fresh database.
