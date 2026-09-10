# ADR-0022: No ORM, no migration tool

- Status: accepted
- Date: 2026-08-18

## Decision

Stdlib `sqlite3`, SQL written out in the routes. Schema is `db.SCHEMA` as
`CREATE TABLE IF NOT EXISTS`, run at import. A rule about what a column may
hold is a Pydantic validator, not a `CHECK`: SQLite cannot add a `CHECK` to an
existing table, so a constraint in the DDL would hold on fresh installs and be
absent on upgraded ones, and one enforced rule beats two different databases.

Anything the DDL cannot reach -- a column added after a database exists, a
pass over rows written under an older rule -- is a step in `db.MIGRATIONS`,
numbered by `PRAGMA user_version`. Append-only and in order: a step's position
is what the file records as done. A new file is stamped at the end of the list,
since SCHEMA declares every column and there are no rows to fold.

That is a list, an integer in the file header and a loop. It is not a
migration tool and must not grow into one: no down-steps, no autogeneration,
no separate directory of versions.

## Consequences

- Do not add SQLAlchemy, SQLModel, Alembic or a migration tool.
- Every step is written idempotent as well as numbered. Every database that
  exists at the time this was taken is at version 0 with the work already
  done, by the version of `init()` that asked on every start; the first
  numbered run has to be a no-op on those rather than an error.
- A row written behind the app's back after its step has run is not folded.
  Nothing reaching the database through the app can be in an old shape --
  every request model and `write_tags` fold on the way in (ADR-0020) -- so
  this costs nothing that is not somebody typing SQL at the file.

## History

- 2026-08-18: schema as DDL, columns as guarded `ALTER TABLE` in `init()`.
- 2026-09-10: numbered. `init()` had grown to six column probes and two data
  passes over every row of six tables, all of it asked again on every start.
  Measured on 20,000 entries: 29.7 ms per start asking, 0.9 ms numbered, and
  the gap grows with the file.
