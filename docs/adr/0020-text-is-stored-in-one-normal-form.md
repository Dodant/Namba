# ADR-0020: Text is stored in one Unicode normal form

- Status: accepted
- Date: 2026-09-09

## Context

Composed and decomposed Korean are different strings to SQLite, and some macOS
apps — and every file name — hand over the decomposed form. The same word
typed twice could be two tags, two languages in the footer picker and a search
that misses the entry it looks for. `COLLATE NOCASE` folds ASCII case only.

## Decision

`db.nfc()` folds text to NFC. Every request model on both APIs inherits
`store.Text`, whose one validator runs it over every string and list of
strings before anything else looks. Every parameter a read filters on —
`value`, `tag`, `q`, `lang`, the path segment the head is built from — goes
through the same function, and so does `write_tags`, so a restore cannot
write an old spelling back. A step in `db.MIGRATIONS` folds rows written
before the rule, once, the way the lower-case tag pass does. The form folds a typed tag too,
so the chip it lights up is the one the API will store.

## Consequences

- Same rule as ADR-0005, one byte level down: one thing, one spelling, one
  address.
- Snapshots are not rewritten; a restore goes through `store` and folds.

## History

- 2026-09-09 (`4b48962`): checked against a fresh database — an NFD tag and an
  NFD language each produced a second row beside the NFC one.
