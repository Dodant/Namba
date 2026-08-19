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
- **In `PostPatch`, an absent field and an explicit `null` are different.**
  `edit_post` reads `model_dump(exclude_unset=True)` to tell them apart, because
  every field defaults to `None` and treating that as "unchanged" made
  `{"image": null}` — the form's Remove button — a no-op. Nullable columns
  (`image`, `lang`) test `in sent`; `title` and `value` keep `is not None`,
  since neither may be nulled. A new nullable column belongs on the same side.
- **`posts.lang` is free-form and usually `NULL`.** It records what an entry's
  own title and body are written in, with the same "whatever people call it"
  rule as `translations.lang` — no enum, no third list to keep in step. Every
  row written before the column has `NULL` and keeps it: backfilling the
  Korean-titled seed entries would be the importer correcting its source.
- **Which language a list reads in is the caller's, not the endpoint's.**
  `/api/numbers` used to hardcode English; both list endpoints now take `lang`
  and run it through `_in_lang()`, and no `lang` substitutes nothing. A post
  with no translation in that language keeps its own title and body — that
  fallback is the feature, not a gap. `fetch_one` deliberately does **not**
  translate: the single-post view has a tab strip, and switching there is the
  reader's own move. The front end defaults the setting to English, which is
  where that old policy went.
- **`posts.grouped` is how the number is written, not what it is.** `value`
  never carries separators; `grouped_value()` puts them on for display and
  leaves anything that is not a plain integer or decimal alone. `ungroup()`
  takes them back out of whatever was typed **whatever the box says** — 1000
  and 1,000 answer at one address or they are two numbers — and returns the
  flag alongside the value, because typing the commas is itself a way of asking
  for them. A comma that is not a thousands separator (`1,2,3`, `Apollo,11`) is
  left where it is. In `/api/numbers` a row is grouped only when
  every entry filed under it is: one number, one spelling, and a disagreement
  falls back to the plain form nobody had to opt into.
- **The SPA catch-all must stay the last route in the file.** Starlette matches
  in the order routes are added, so `@app.get("/{path:path}")` swallows every
  `/api/...` declared below it. It serves built assets by path and `index.html`
  otherwise, and `realpath`s the target first — `path` comes off the wire and
  `..` in it must not walk out of `dist/`.
- **`/p/{id}` gets its `<head>` written server-side.** `og_head()` replaces the
  title and description and appends the `og:`/`twitter:` tags, because no
  crawler runs the JavaScript that would set them client-side — that is the
  reason the API serves the front end at all. Everything is `html.escape`d:
  entry titles are written by strangers and land inside an attribute.
  `og_summary()` is a simpler cousin of `plain()` in the front end's `api.ts`;
  they are deliberately not kept in step, since one feeds a preview row and the
  other a meta tag and nobody sees both at once.
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
- Pydantic length caps on every field. Tags are checked for shape, not
  membership — there is no `TAGS` list any more. `_clean_tags()` folds case and
  whitespace, refuses a blank and a slash, and holds `TAG_MAX` (24) and
  `TAGS_PER_POST` (2). Those two numbers are the row in the root `CLAUDE.md`
  that is hand-copied into `api.ts`; the vocabulary is not.
- Write rate limit is a per-process in-memory dict (20/min/IP). It is per-worker;
  run one worker or move it to redis. Reads are not limited.
- Likes are a bare counter; the browser's `localStorage` prevents double-voting.
  Deliberately naive.

## Tests

`test_namba.py` is plain asserts run by `if __name__ == "__main__"` — no pytest,
no fixtures. Add cases to the existing functions. A test that cannot fail is
worse than no test: if you add one, break the code once and confirm it goes red.
