# ADR-0007: A write that decides holds the lock while it decides

- Status: accepted
- Date: 2026-09-09

## Context

Python's `sqlite3` in its legacy isolation mode issues `BEGIN DEFERRED` before
the first write, so a `SELECT` earlier in a `with con:` block holds no lock at
all. In WAL that never fails: it answers about the database as it stood while
another writer commits over it, and the route then decides on what it read.

## Decision

Every public write that decides — a 404 on a row that has to still be there, a
duplicate check, a format that depends on what a sibling entry chose — runs
inside `db.writing(con)`, which is `BEGIN IMMEDIATE`. The lock is held from the
first line, not the first write. A write that only appends (`/api/upload`)
uses `with con:`.

Moving the reads inside without `IMMEDIATE` is worse than leaving them out: a
deferred transaction that reads then writes must upgrade its lock, two of them
together deadlock, `busy_timeout` does not apply to an upgrade, and the quiet
race becomes a 500.

## Consequences

- Writers are serialised for the length of the block. Readers are untouched.
- `test_every_write_decides_inside_the_lock` asserts the rule from outside: at
  each route's deciding read a second connection tries for the write lock and
  is refused. `con.in_transaction` cannot stand in for it.
- No file or network I/O inside a `writing()` block.

## History

- 2026-09-09 (`37cfadd`): measured on two concurrent creates of the same
  abbreviation. With the deciding read outside the transaction, two spellings
  were stored in three of eight trials. With it inside a deferred transaction,
  no split and a 500 "database is locked". With `BEGIN IMMEDIATE`, one spelling
  and no error.
