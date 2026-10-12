# ADR-0032: The contributors page is a tally, not a profile

- Status: accepted
- Date: 2026-10-12

## Context

The wiki already records who wrote what: `posts.author` is the first writer
and `revisions.author` is the nickname every public edit, restore and
translation filed its snapshot under. A page thanking the people who write
here could be built from those two columns alone.

The obvious version of that page is a list of names, each a link to what that
name wrote. On a wiki with no reader accounts (ADR-0001) that is the one thing
it cannot be. A nickname is a string anybody can type. A page per nickname
reads as a profile that belongs to somebody, when it is really a filter on a
text column that a stranger can add to under the same name.

## Decision

`GET /api/contributors` returns `{nickname, entries, edits}` and nothing else,
and `/contributors` draws it as one table. The names are plain text. There is
no per-nickname page, no list of a nickname's entries and no link from a name.

- **Entries** counts `posts.author`. **Edits** counts `revisions.author`.
- Both halves count only `ACTIVE` entries, so the read joins the public reads
  `test_hidden_is_invisible` walks, which now number fifteen.
- An operator's snapshot is labelled with their email. It is excluded by its
  `events` row having `admin_id` set, not by the label, which a reader could
  type.
- Empty and `anonymous` bylines are excluded. Names are grouped as stored, so
  `Ed` and `ed` are two rows. The top hundred are shown, ordered by entries,
  then edits, then nickname.

Translations and comments are not counted separately, and there is no period
filter.

## Consequences

The page answers "who has been writing here" without answering "what did this
person write". Adding the second question needs this record revised first, and
`CLAUDE.md` changed with it, because a per-nickname list is "my posts".
