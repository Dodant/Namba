# ADR-0009: Shared vocabularies are hand-copied and checked, not generated

- Status: accepted
- Date: 2026-08-18; test added 2026-09-09

## Context

The five formats, the two tag limits, seven moderation vocabularies and the
index's bands exist in both apps. The backend's 422 catches drift in one
direction only: a front end offering a value the backend does not know fails
loudly, while a backend value the front end never lists is a menu item that is
simply missing.

## Decision

Both copies are written by hand, in `numfmt.py`/`db.py`/`main.py` and in
`src/api.ts`, and `test_the_two_apps_still_agree` reads the TypeScript and
compares every row. The bands are compared as sets in both directions, since
`bucket_of` is a function on one side and a list on the other, and a label the
front end does not carry is entries on no page.

No codegen and no shared file. Being one repository, so the pair moves in one
commit, is the design. A shared JSON file would also cost the `as const`
literal types (`Format`, `PostStatus`) the front end leans on.

## History

- 2026-08-18: the two lists, hand-copied.
- 2026-09-09 (`42d1c97`): the bands became the fourth row of the table and the
  test compares them as sets.
- 2026-09-11: a sixth format and a third band list. `MONTH_BUCKETS` is
  compared the same way the other two are, and the formats are compared as a
  *tuple*, so the position `CALENDAR` takes in the list -- which is the order
  the front end draws the tabs in -- has to agree as well (ADR-0026).
