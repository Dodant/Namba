# ADR-0027: A number format says the value is a number, and that is checked

- Status: accepted
- Date: 2026-09-11

## Context

Six formats, and until now two of them were *checked* and four were *believed*.
The line was drawn at what the format claims: `ABBR` says the value is a word
and `CALENDAR` says it is a day of the year, which are claims about the value
that can be wrong, while the four that read digits were described as ways of
*reading* what was typed and therefore unable to be wrong about it. So
`resolve_format` refused a bad abbreviation and a bad date, and for an explicit
`INTEGER` or `DECIMAL` it did this:

```python
try:
    key = float(value)
except ValueError:
    key = None
```

Three things found during the pre-merge review of the calendar branch say the
line was in the wrong place.

**A missing sort key takes an entry off the index.** `bucket_of` has no band
for a null key, and the Integer tab is the one tab that both fills a fixed
band list and filters rows into it — `BUCKETS.map(b => rows.filter(n =>
n.bucket === b))` in `Home.tsx`. An entry with no band matches none of the
five and is drawn nowhere. `POST /api/posts {"value": "9 3/4", "format":
"INTEGER"}` was a 201, and the entry then answered at `/n/9 3/4`, appeared in
the sitemap, and was on no page of the wiki. That is the exact failure the
root note's band rule is written to prevent, arriving through the value
instead of through the band list.

**`float()` is not the check it looks like.** It reads `nan` and `inf`.
SQLite stores NaN as NULL, which is the paragraph above again by another
road. It stores Inf as Inf, and `json.dumps` refuses to serialize one — so
`{"value": "inf", "format": "INTEGER"}` committed the row inside
`db.writing`, then raised while rendering the 201. **After that, every
response carrying that row was a 500:** `/api/numbers`, which is the index,
and `/api/posts`, which the feed and the search share. Measured on a fresh
database on 2026-09-11. One unauthenticated POST, no rate limit reached, and
the wiki's index is blank for every reader until an operator finds the row and
hides it. The server-rendered `<head>`s and the sitemap kept answering 200,
which is what would have made it quiet.

**Re-filing reached the same state from the other side**, which the section
lock in ADR-0026 closed separately: a `CALENDAR` or `ABBR` entry re-filed as
`INTEGER` kept a value that is not a number and lost its key.

## Decision

**`INTEGER` and `DECIMAL` are the claim that the value reads as a number, and
`resolve_format` checks it: `float()` must return a finite number, or the
write is a 422.** Five of the six formats are now checked. The rule lives in
the same function as the other four checks, so all three writes — create, edit
and the operator's renumber — hit it, and in `edit_post` it is raised inside
`with con` so a refused edit rolls back the snapshot it had taken.

**`TIME` is left taken at its word.** An explicit `TIME` on `1:29:300` still
files with no sort key. Nothing bands on a `TIME` key and nothing can fail to
serialize a null, so there is no second reason here the way there is for the
other two, and `11:11` filed as a clock by somebody who meant a clock is not
a claim anyone is harmed by. `MIXED` claims nothing at all, being the
remainder.

**The check is `float()` and not a stricter pattern, and it decides nothing
about spelling.** `-42` and `1e5` are numbers `parse_number` does not guess
at — a minus sign and an exponent are exactly what an explicit pick is *for* —
and `bucket_of` already bands a negative by its magnitude. `1_000` and `٤٢`
read too, and both stay as typed: two spellings of a number are two entries
sharing a sort key (ADR-0005). `CALENDAR` is the one format that promised the
opposite, and it is the only one whose pattern says `[0-9]`.

## Consequences

- The root note's "four read digits and cannot be wrong about it" framing is
  replaced in all three `CLAUDE.md` files. The count that matters is now five
  checked, one believed, one claiming nothing.
- A 500 that an anonymous visitor could trigger, and that took the index down
  for everyone until it was found by hand, is gone. There is no test for the
  old shape because the old shape cannot be written any more; what
  `test_api_round_trip` holds instead is that a refused write leaves
  `/api/numbers` and `/api/posts` answering 200.
- `test_parse` carries the table — twelve values refused, seven accepted with
  the key each settles — because the rule is `store.resolve_format`'s and not
  a route's.
- **Rows written before this rule are not reached by it.** Nothing migrates
  and nothing re-validates: `restore_revision` and `apply_snapshot` already
  re-check nothing on purpose, the same way `write_tags` normalises without
  validating. A live row with an unreadable value and a null key keeps
  answering at `/n/` and stays off the Integer bands, and an edit of one is
  now a 422 the reader cannot act on. The check before deploying is one
  query — `SELECT id, value, format FROM posts WHERE format IN ('INTEGER',
  'DECIMAL') AND sort_key IS NULL` — and the fix for anything it returns is
  the operator's renumber. Left as a deploy step rather than a tolerance
  branch in `edit_post`, because the branch would have to skip re-settling on
  an unchanged pair and that quietly changes what Auto-detect does on an edit.
- The front end is unchanged. `cleanNumberInput` already filters the Number
  field to digits when Integer or Decimal is picked, and it deliberately does
  not rewrite a value that was already in the box when the format changed —
  so the 422 is what catches `11/22/63` switched to Integer, and it should
  stay that way rather than the filter growing a rewrite.

## History

- 2026-09-11: decided and built, out of the pre-merge review of the calendar
  branch. The requester chose it over the alternative, which was to leave the
  write alone and give the Integer tab a sixth band for rows the five do not
  cover. That option would have made the index honest without making the data
  right, and it would not have touched the `inf` crash at all.
