# Namba-backend

FastAPI over stdlib `sqlite3`. Five files: `main.py` (every route + models),
`db.py` (schema), `numfmt.py` (number parsing), `seed.py` + `seed_tags.py`
(the markdown importer).

```sh
.venv/bin/python test_namba.py        # run before saying anything passes
.venv/bin/python seed.py --reset      # wipe + reload from ../Memorable Numbers.md
.venv/bin/uvicorn main:app --reload
```

Env overrides: `NAMBA_DB`, `NAMBA_UPLOADS` (the tests use both to stay hermetic).

## Load-bearing details

- **`check_same_thread=False` in `db.connect()` is not cruft.** FastAPI opens the
  connection in one threadpool thread and runs the endpoint in another. Removing
  it produces 500s only under concurrent requests — a single curl passes, and so
  does `TestClient`, which funnels everything through one portal thread.
  `test_connection_crosses_threads` is the guard; it spawns a real thread.
- **`revisions` has no foreign key on purpose.** It is the only thing between
  vandalism and permanent loss on a wiki nobody logs into, so the rows must
  outlive the post. Every edit, restore and delete snapshots first. Adding
  `REFERENCES posts(id) ON DELETE CASCADE` would silently make deletes
  unrecoverable.
- **`edit_post` must not touch `author`.** It writes `edited_by` and
  `updated_at`; `author` stays whoever created the entry. `restore_revision` does
  the same, crediting whoever pressed Restore. New columns need the guarded
  `ALTER TABLE` in `db.init()` too — `CREATE TABLE IF NOT EXISTS` skips existing
  databases.
- **`/api/numbers` is an ordered scan grouped in Python, not a `GROUP BY`.** The
  home list needs each number's entry titles, so aggregating and then re-querying
  for them would be two passes to build one thing. It returns `entries`, not a
  `count` — and stays lean deliberately: ids and titles only, never bodies, tags
  or dates.
- **Translations ride inside the post snapshot.** `fetch_one` attaches them and
  `snapshot()` reads through `fetch_one`, which is the whole reason a removed
  translation is recoverable — and why `restore_revision` calls
  `_write_translations`. Keep them out of `shape()`: the list endpoints must
  stay lean. `lang` is `COLLATE NOCASE` with `UNIQUE(post_id, lang)`, so the
  `ON CONFLICT(post_id, lang)` upsert is what makes a rewrite an edit.
- **`post_links` always stores `a_id < b_id`** (there is a CHECK). Sort the pair
  before insert or delete; read it back with the `UNION` in `get_post`.
- **`bucket_of` only bands INTEGER.** A TIME sort key is minutes past midnight,
  so banding 09:41 by magnitude files it under "100".
- **`parse_number` is a suggestion.** `11:11` is a clock, `1:29:300` is
  Heinrich's law; nothing in the string distinguishes them, so the poster's
  explicit `format` wins in `resolve_format`.

## No ORM

Do not add SQLAlchemy, SQLModel, Alembic or a migration tool. Schema lives in
`db.SCHEMA` as `CREATE TABLE IF NOT EXISTS` and runs at import. To change it,
edit the DDL and reseed.

## Trust boundaries — do not thin these out

No auth means the input validation *is* the security model.

- Uploads: extension allowlist, 5 MB cap, and the filename is always
  `uuid4().hex + ext`. Never build a path from `file.filename`.
- Pydantic length caps on every field, and tags must be in `TAGS`.
- Write rate limit is a per-process in-memory dict (20/min/IP). It is per-worker;
  run one worker or move it to redis. Reads are not limited.
- Likes are a bare counter; the browser's `localStorage` prevents double-voting.
  Deliberately naive.

## Tests

`test_namba.py` is plain asserts run by `if __name__ == "__main__"` — no pytest,
no fixtures. Add cases to the existing functions. A test that cannot fail is
worse than no test: if you add one, break the code once and confirm it goes red.
