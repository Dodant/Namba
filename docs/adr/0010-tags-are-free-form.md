# ADR-0010: Tags are free-form

- Status: accepted
- Date: 2026-08-19

## Context

A fixed list of categories is a claim about what people are allowed to mean,
and it was the only thing forcing two apps to agree on a literal that is not a
parser branch.

## Decision

Anyone can coin a tag. The backend checks a tag's shape — lower-cased,
whitespace-collapsed, at most `TAG_MAX` characters, no slash since a tag is a
path segment — and never its membership. `/api/tags` reports the vocabulary in
use, most-used first, and the form offers those as chips. Two tags per entry: a
film of a book gets both, and that is as wide as an entry honestly is.

## Consequences

- The tag row left the hand-synced table (ADR-0009).
- Lower-case all the way through, on screen too; `/t/BOOK` still resolves.
- Rows written under the earlier upper-case rule are folded by `db.init()`.

## History

- 2026-08-18: twenty fixed tags, upper-case, five per entry.
- 2026-08-19 (`ed1afbe`, `00aa004`, `ee96661`): free-form, lower-case, two per
  entry.
