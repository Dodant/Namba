# ADR-0022: No ORM, no migration tool

- Status: accepted
- Date: 2026-08-18

## Decision

Stdlib `sqlite3`, SQL written out in the routes. Schema is `db.SCHEMA` as
`CREATE TABLE IF NOT EXISTS`, run at import. A new column is a guarded
`ALTER TABLE ADD COLUMN` in `db.init()`, since `CREATE TABLE IF NOT EXISTS`
skips a database that exists. A rule about what a column may hold is a
Pydantic validator, not a `CHECK`: SQLite cannot add a `CHECK` to an existing
table, so a constraint in the DDL would hold on fresh installs and be absent on
upgraded ones, and one enforced rule beats two different databases.

## Consequences

- Do not add SQLAlchemy, SQLModel, Alembic or a migration tool.
- The `PRAGMA table_info` probes in `db.init()` grow with the schema. Past a
  handful, `PRAGMA user_version` with numbered steps is the stdlib answer, and
  the point at which to take it.
