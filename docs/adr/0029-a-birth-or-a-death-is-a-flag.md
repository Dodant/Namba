# ADR-0029: In Memoriam is a flag, not a format

- Status: accepted
- Date: 2026-09-14

## Context

The Calendar tab draws twelve month bands, each a flat list of dates
(ADR-0026). This wiki had no way to split what a day *means* from the people
who died on it: a memorial entry sat beside an annual observance with nothing
between them.

Shown as an **In Memoriam** section at the foot of every month,
closed, opening in place, with a checkbox on the write form.

Three things had to be settled: what the flag *is*, where a flagged entry goes,
and whether the fold reaches past the index.

## Decision

**A column on `posts`, not a seventh format and not a section.**
`posts.format` decides how a value is read, sorted and addressed, which is the
argument that made `ABBR` and then `CALENDAR` formats rather than a `kind`
column (ADR-0026). It lands the other way here: a death date *is* a `CALENDAR`
date, it reads as a date, it sorts on `month * 100 + day`, and it answers at
`/c/12-25` beside Christmas. None of the three things a format decides changes,
so what is left is how the entry is *drawn* — which is `posts.grouped`'s kind of
fact, and it sits beside it in the table.

**Not a tag either**, which was the other candidate and is worse twice over:
`TAGS_PER_POST` is 2 and this would spend one of them on every entry that uses
it, and a UI that branches on a tag's name turns a free-form vocabulary into a
hidden enum, which is the thing ADR-0010 exists to prevent.

**One flag, because In Memoriam is one state.** An entry is either an ordinary
calendar date or the death date of a deceased person. There is no event-kind
vocabulary to maintain and no birth option to offer; a boolean is sufficient.

**Nothing joins that table.** No format, no vocabulary, no band label:
`bucket_of` is untouched and `test_the_two_apps_still_agree` needed no new row.
`grouped` is not in the table either, and this is the same kind of column.

**The split is per entry, not per date.** A date can keep an observance in the
month's list and a person's death in its fold, so a date is drawn in each place
it has entries for rather than a whole date going one way because of one of its
entries. `/api/numbers` therefore carries `birth_death`, its legacy storage
name, on the **entry** and not on the row.

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
an entry was In Memoriam is a worse record, the same argument `edited_by` and
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
Two deaths on one day are two entries at one address, the way two meanings of
42 are.

**What is refused is a date that has not happened, not a year past today.**
Today being the 14th of September, a death filed at 12-25 in this year has not
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
not a trust boundary. The field is required when the box is ticked and is
attached to the month and day as the third Date control. Unticking clears the
year, because a year with no death beside it is a year of nothing.

**BC is left out.** An era label is seven locales' worth of words and an
off-by-one between astronomical and historical year numbering, and nobody asked
for it. `ge=1` says so. An entry about a death in 44 BC still works — it simply
carries no year.

**The index and a mark on the entry; `/c/MM-DD` is left alone.** The date page
is one day and a handful of entries, where a fold is machinery for nothing. The
mark is a `.kicker` in the entry's meta row, not a link and not a tag — a tag
goes to `/t/` and this goes nowhere — because the flag is otherwise invisible to
whoever is about to edit the entry.

**And the checkbox's hint is a rule.** In Memoriam accepts only the date on
which a deceased person died. It does not accept a birth date, whether the
person is living or dead, so the rule is said where the box is ticked rather
than left implicit in the section name.

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
  handful of entries is not a list to get past. **An event-kind enum**: In
  Memoriam is death-only, so a second vocabulary would add no information.

## History

- 2026-09-15: renamed the section **In Memoriam** and narrowed its contract to
  death dates only. Birth dates do not belong in the fold, including those of
  people who have since died. The database and API keep `birth_death` as a
  legacy field name so existing rows and clients do not require a destructive
  migration; its product meaning is now only the In Memoriam flag.
- 2026-09-15: made the year of death mandatory for In Memoriam. The form puts
  it beside month and day as part of Date, and both public write routes reject
  a memorial with no year. The database column remains nullable because every
  ordinary entry has no death year.
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
- 2026-09-14: the pre-merge review of the branch, seven specialist passes and
  two adversarial ones. What it found, and what changed:
  - The operator's diff reported `birth_death` going from nothing to false on
    every revision written before the column existed, because `_state` read
    the snapshot raw while the live row had the column. It now reads a missing
    key as the column's default, the way `apply_snapshot` always has.
  - The form kept the box and the year while Format was moved off Calendar, on
    purpose, and sent both anyway — so an Integer entry could be filed with a
    flag ticked three clicks earlier. The state still stays; the payload is
    gated on the format.
  - `02-29` with a year that had no 29th of February was stored. ADR-0026
    accepted the leap day because there was no year to disagree with it; now
    there can be one, and the check refuses the pair.
  - "Today" was the UTC date and the form's `max` was the reader's, so for up
    to nine hours a day a Korean reader filing today's date was told it had
    not happened. Today is now UTC plus fourteen hours, the latest date it is
    anywhere, which no local clock can be ahead of. The alternative — the form
    computing in UTC — agreed with the server exactly and told the same reader
    that their own today was tomorrow.
  - **The decision above that the renumber does not ask is reversed.** It
    could move `01-01` in this year to `12-25` and leave a future date on the
    row, and from then on every public edit of that entry — a typo in the body
    — was refused for a year nobody in the request had touched. The route with
    both halves in hand now asks, and the operator sees the 422 with the value
    and the year in front of them. `refuse_a_future_year` moved to `store.py`
    beside `resolve_format` for it, since `admin_api` cannot import `main`.
  - A year with no flag beside it was accepted by the API and drawn on
    `/n/42`, while the form sent `null` for the pair and so erased it on the
    next save. Both public writes now drop the year when the flag is off,
    which is the form's own answer; refusing it instead would have held an API
    client that only unticked the box for a year it may not have known about.
  - The test that pinned the whole-date rule filed this year's Christmas and
    expected a refusal, which is true for fifty-one weeks and false for the
    week after Christmas, so the suite would have gone red every December. It
    now files tomorrow, off the clock the API reads, and pins the fourteen
    hours with the clock held.
  - Smaller: two `MIGRATIONS` arms the suite walks, not one; the fold's indent
    is a `translate` rather than a margin, because on a coarse pointer
    `.ix-fold` buys its hit box with a negative margin that a more specific
    `margin-left` had been beating by 10px; the year field inside the Number
    field carried a second bottom margin; the 409 clash sentence names the
    flag and the year among what another editor moved; the year input lost a
    placeholder that showed the one year the hint forbids.

  Weighed and left for later, since none of it is this branch's: the back
  office does not show the flag or the year on an entry; `REPORT_REASONS` has
  no privacy reason for a living person's date of birth; the year is not part
  of what `/api/posts?q=` searches; a date drawn in both of a month's lists
  carries `aria-current="date"` twice.
- 2026-09-14: the first of those four, the same day, on the requester's
  call. The back office draws the flag and the year on the entry page, in
  the sheet and in the content table -- the detail read had carried both
  since the columns landed, being `SELECT *` through `fetch_one`, and only
  the list's explicit column list and the three views were short of them.
  Nothing edits either from the panel; the wiki's form stays the one editor
  of both, the way it is for every field but the number.
