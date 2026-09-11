# Decision records

One file per decision that is not up for quiet revision, numbered in the order
it was taken. A record says what was decided, why, what it costs, and how it
got here — the history that the notes in `CLAUDE.md` do not carry. The notes
say the rule as it holds today and point here (`ADR-0002`); a record is where
"used to", a date, a measurement or a commit hash belongs.

A record is not rewritten when the decision moves. It gets a new line under
*History* and, if the decision is replaced, its status changes to
`superseded by ADR-00xx`. A new decision gets its record in the same commit as
the rule it introduces.

| # | Decision | Status | Since |
|---|---|---|---|
| [0001](0001-no-reader-accounts.md) | No reader accounts; operators are the one exception | accepted | 2026-08-18, revised 2026-08-20 |
| [0002](0002-nothing-removes-an-entry.md) | Nothing removes an entry; purge is a shell command | accepted | 2026-08-20, measured 2026-09-10 |
| [0003](0003-what-outlives-the-entry.md) | Revisions, requests, reports and events outlive the entry; comments and links do not | accepted | 2026-08-20 |
| [0004](0004-events-is-append-only.md) | `events` is append-only, and a purge does not reach it | accepted | 2026-08-20, amended 2026-09-09 |
| [0005](0005-a-number-is-a-column.md) | A number is a column, and a value has one spelling | accepted, with open items | 2026-08-18 |
| [0006](0006-saves-carry-a-base-timestamp.md) | A save carries the entry as the sender last saw it | accepted | 2026-09-09 |
| [0007](0007-a-write-that-decides-holds-the-lock.md) | A write that decides holds the lock while it decides | accepted | 2026-09-09 |
| [0008](0008-one-process.md) | One process | accepted | 2026-09-09 |
| [0009](0009-vocabularies-are-hand-copied.md) | Shared vocabularies are hand-copied and checked, not generated | accepted | 2026-08-18 |
| [0010](0010-tags-are-free-form.md) | Tags are free-form | accepted | 2026-08-19 |
| [0011](0011-the-server-writes-the-head.md) | The server writes every page's `<head>` | accepted | 2026-08-31 |
| [0012](0012-a-link-stays-a-link.md) | A link in an entry stays a link | accepted | 2026-08-19 |
| [0013](0013-the-seed-reports.md) | The seed reports, it does not correct | accepted | 2026-08-18 |
| [0014](0014-operators-log-in-with-password-and-totp.md) | Operators log in with a password and a TOTP code, enrolled from the shell | accepted | 2026-09-07 |
| [0015](0015-two-kinds-of-language.md) | Interface locale and entry language are two things | accepted | 2026-09-02 |
| [0016](0016-the-back-office-is-a-second-document.md) | The back office is a second document | accepted | 2026-08-20 |
| [0017](0017-the-front-end-has-no-test-runner.md) | The front end has no test runner beyond `node --test` | accepted | 2026-09-09 |
| [0018](0018-the-public-api-is-written-to-from-its-own-pages.md) | The public API is readable from anywhere and written to from its own pages | accepted | 2026-09-09 |
| [0019](0019-a-picture-is-one-of-the-uploads.md) | An entry's picture is one of this wiki's uploads | accepted | 2026-09-09 |
| [0020](0020-text-is-stored-in-one-normal-form.md) | Text is stored in one Unicode normal form | accepted | 2026-09-09 |
| [0021](0021-the-content-is-cc0-the-code-is-mit.md) | The content is CC0; the code is MIT | accepted | 2026-08-20, 2026-09-09 |
| [0022](0022-no-orm.md) | No ORM; anything the DDL cannot reach is a numbered migration | accepted | 2026-08-18, numbered 2026-09-10 |
| [0023](0023-a-snapshot-has-its-own-shape.md) | A snapshot has its own shape, not `fetch_one`'s | accepted | 2026-09-10 |
| [0024](0024-backups-live-with-the-host.md) | Backups live with the host, not in this repository | accepted | 2026-09-10 |
| [0025](0025-a-queue-is-worked-without-leaving-it.md) | A queue is worked without leaving it | accepted | 2026-09-10 |
| [0026](0026-a-calendar-date-is-a-format.md) | A fixed calendar date is a format, and a third section | accepted | 2026-09-11 |
| [0027](0027-a-number-format-says-the-value-is-a-number.md) | A number format says the value is a number, and that is checked | accepted | 2026-09-11 |
| [0028](0028-the-plugin-is-the-one-read-that-is-counted.md) | The editor plugin's read is counted, and it is not an event | accepted | 2026-09-11 |
