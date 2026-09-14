# ADR-0029: A birth or a death is a flag, not a format

- Status: accepted
- Date: 2026-09-14

## Context

The Calendar tab draws twelve month bands, each a flat list of dates
(ADR-0026). Wikipedia's date pages split what a day *means* from who was born
and who died on it, and this wiki had no way to say which an entry was:
"Isaac Newton born" sat in December beside "Christmas" with nothing between
them.

Asked for as a **Births / Deaths** section at the foot of every month,
closed, opening in place, with a checkbox on the write form.

Three things had to be settled: what the flag *is*, where a flagged entry goes,
and whether the fold reaches past the index.

## Decision

**A column on `posts`, not a seventh format and not a section.**
`posts.format` decides how a value is read, sorted and addressed, which is the
argument that made `ABBR` and then `CALENDAR` formats rather than a `kind`
column (ADR-0026). It lands the other way here: a birth *is* a `CALENDAR` date,
it reads as a date, it sorts on `month * 100 + day`, and it answers at
`/c/12-25` beside Christmas. None of the three things a format decides changes,
so what is left is how the entry is *drawn* — which is `posts.grouped`'s kind of
fact, and it sits beside it in the table.

**Not a tag either**, which was the other candidate and is worse twice over:
`TAGS_PER_POST` is 2 and this would spend one of them on every entry that uses
it, and a UI that branches on a tag's name turns a free-form vocabulary into a
hidden enum, which is the thing ADR-0010 exists to prevent.

**One flag for both, because one checkbox was what was asked for.** Two
sections, Wikipedia's shape, would have meant a three-way vocabulary
(none / birth / death), and a vocabulary is a row in the hand-copied table
(ADR-0009) and a `<select>` where a checkbox was wanted. A boolean is neither.

**Nothing joins that table.** No format, no vocabulary, no band label:
`bucket_of` is untouched and `test_the_two_apps_still_agree` needed no new row.
`grouped` is not in the table either, and this is the same kind of column.

**The split is per entry, not per date.** December 25 keeps Christmas in the
month's list and Newton's birth in its fold, so a date is drawn in each place it
has entries for rather than a whole date going one way because of one of its
entries. `/api/numbers` therefore carries `birth_death` on the **entry** and not
on the row.

**The band head counts the whole month.** A closed band's one line is all it
says about itself, so it must not count only the half that is not folded; dates
are counted by `value`, since a split one is in both lists and is still one
date.

**Not gated to `CALENDAR` on the way in.** The write form sends every field on
every save, so a 422 on a flag the sender never meant to change would leave an
entry that somehow acquired one unsaveable for good. The checkbox is only
*offered* where it means something, and nothing but the Calendar index reads the
column. A flag on an Integer entry is inert rather than refused.

**It is content, so a revision keeps it.** `birth_death` is in
`SNAPSHOT_FIELDS` and `apply_snapshot` writes it back: a version that cannot say
an entry was a birth is a worse record, the same argument `edited_by` and
`updated_at` are in that list for (ADR-0023). It is in `DIFF_FIELDS` too,
because an edit can change it and the diff is where an operator sees what moved.

**Its own numbered migration step.** A database already at 3 has passed
`_columns_added_since_the_first_release` and would never run it again, so the
column gets step 4 (ADR-0022). It is also the only migration arm the suite can
walk for real — every test database takes its columns from `SCHEMA`, so a step
that adds one is always a no-op there — which is why
`test_the_schema_moves_forward_once` now drops the column and stands
`user_version` back to watch the `ALTER` run.

**A year is a second annotation beside it, and it is never in `value`.**
ADR-0026 kept the year out of a calendar date because a date that happens once
is a number and belongs at `/n/`; this is that rule reached from the other side.
The entry is still *about* the day of the year — it is filed under December 25
and appears there — and the year says which December 25 it was, the way a date
page's own lists do. `posts.year`, nullable, and nothing sorts or bands on it.
Two births on one day are two entries at one address, the way two meanings of
42 are.

**What is refused is a date that has not happened, not a year past today.**
Today being the 14th of September, a birth filed at 12-25 in this year has not
happened, and a year-only test would wave it through for three and a half
months — so `refuse_a_future_year` builds the whole date out of the settled
value and compares that. It is a route check and not a validator for the reason
`resolve_format`'s are: it needs both halves, and an edit sends a year with no
value at all. `ge=1` on the field is the other end and the only other bound
there is, since today is the cap.

**Neither `restore_revision` nor the operator's renumber asks**, the way
neither re-checks `is_abbr` or `date_key`: a snapshot has to be restorable or
the history is not a history, and it cannot bite anyway — a year that was past
when it was written only gets more so. The renumber could move a date forward
past a year already on the row; that route carries a name, a snapshot and an
audit row, which is the line ADR-0026 already draws.

**The form draws the same rule first, and it is not the one that counts.**
`<input type="number">` with `min={1}` and a `max` of this year if the day has
come round and last year if it has not — the stepper, the numeric keyboard and
a refusal before the request. The 422 is still what settles it: a browser is
not a trust boundary. The field is offered only when the box is ticked, and
unticking it clears the year, because a year with no birth beside it is a year
of nothing and the field it was typed in is gone.

**BC is left out.** An era label is seven locales' worth of words and an
off-by-one between astronomical and historical year numbering, and nobody asked
for it. `ge=1` says so. An entry about a death in 44 BC still works — it simply
carries no year.

**The index and a mark on the entry; `/c/MM-DD` is left alone.** The date page
is one day and a handful of entries, where a fold is machinery for nothing. The
mark is a `.kicker` in the entry's meta row, not a link and not a tag — a tag
goes to `/t/` and this goes nowhere — because the flag is otherwise invisible to
whoever is about to edit the entry.

**And the checkbox's hint is a rule.** The guide lists *a living person's date
of birth* under **Never eligible** and *a living person's birthday* as "Not an
entry" in its calendar table. A Births list is an invitation to file exactly
that, so the rule is said where the box is ticked rather than only in `/guide`.
No rule changed and the guide's own text is untouched.

## Consequences

- `posts` gains two columns, both of them in `SNAPSHOT_FIELDS`, in
  `apply_snapshot` and in `DIFF_FIELDS`: that list goes from thirteen fields to
  fifteen, `apply_snapshot` writes thirteen of them rather than eleven, and the
  diff reads nine rather than seven.
- `db.MIGRATIONS` has a fourth step and a fifth, one per column, and
  `PRAGMA user_version` is 5. The second is its own rather than a line in the
  first because the first had already run wherever the fold shipped — which is
  the append-only rule doing exactly what it is for, one commit apart.
- The year is drawn in three places off one `.yr` class: leading an index row's
  line, leading a card's heading (so `/c/12-25`, search and tag pages carry it)
  and beside the mark in the entry's meta row. Plain digits in every locale —
  a year is not grouped, so 1642 and never 1,642.
- **`measure` in `Home.tsx` moved to module scope and the fold calls it on
  open.** Its comment had said a resize was the whole of it, because every
  `<details>` in the index is open when it is first drawn; these are the first
  rows that are not. Whether a hidden row can be measured is the browser's call
  — with `::details-content` it is laid out and measurable while hidden, and
  without it the rows are `display: none`, measure 0, are never marked as
  clipped, and no later pass corrects them, so "See more" would be missing from
  every row in the fold for good. Chrome 151 was measured doing the former; the
  re-measure on open is what makes it right in both.
- The fold's summary is indented to the title column rather than left at the
  gutter. At the gutter its caret sat in the band head's own caret column —
  two disclosures in a line, one meaning the month and one meaning this — and
  it read as a second heading rather than as more of the list. Below 560 the
  numeral stops being a column and the indent goes with it.
- Three keys in seven locales: the section's name, the checkbox's label and
  its rule. The fold's count is `common.entries` and not `home.foldedEntries` —
  that one belongs to a row's own fold, which only opens past `FOLD_OVER` and so
  never has to say "1 entries".
- Two things were weighed and left out. **A fold on `/c/MM-DD`**: one day and a
  handful of entries is not a list to get past. **A `birth` / `death`
  distinction**: it is a vocabulary, and the checkbox was the ask.

## History

- 2026-09-14: decided and built. The three questions above were put to the
  requester before anything was written; the answers were one checkbox and one
  combined section, a flagged entry leaving the month's main list, and the index
  plus a mark on the entry. The measurement hazard was found while planning and
  shipped in the same change; the browser it was first run against turned out
  not to have it, which is why the note above says what the mechanism is rather
  than asserting a bug.
- 2026-09-14: the year, asked for the same day. The question it raised was
  whether a year belongs in `value` — it does not, and the answer is the
  address rule ADR-0026 already settled: `/c/12-25` is the day of the year, so
  a year is an annotation on the entry rather than part of where it answers.
  "No future" was read as the whole date rather than the year alone, which is
  the reading that does not leave a hole between today and the 31st of
  December; the test pins it by filing this year's Christmas and being refused.
