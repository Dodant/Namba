# ADR-0013: The seed reports, it does not correct

- Status: accepted
- Date: 2026-08-18

## Decision

`seed.py` loads `Memorable Numbers.md` as written. It prints the Korean titles
and the `801.11` typo instead of translating or fixing them. Correcting source
data is the wiki's job, and an importer that quietly improves its source is an
importer whose output cannot be traced to its input.

## Consequences

- Twenty seeded entries carry Korean titles until somebody adds an English
  tab beside them.
- `posts.lang` is `NULL` on every seeded row and stays so until an edit saves
  it; nothing backfills on an entry's behalf.
