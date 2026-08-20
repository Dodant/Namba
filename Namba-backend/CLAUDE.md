# Namba-backend

FastAPI over stdlib `sqlite3`. Ten files:

| | |
|---|---|
| `main.py` | the wiki's routes and models |
| `admin_api.py` | the back office's routes, under `/api/admin` |
| `db.py` | schema, `connect()`, `get_db()`, `now()` |
| `events.py` | who a request is from, as hashes, and the log of what they did |
| `auth.py` | operator passwords, sessions and the `require_admin` dependency |
| `numfmt.py` | number parsing |
| `seed.py` + `seed_tags.py` | the markdown importer |
| `gc_uploads.py` | the uploads collector |
| `admin.py` | the operator's shell commands |

The last two run from cron and from a shell, never from a route — there is
nobody to stop a stranger triggering one.

```sh
.venv/bin/python test_namba.py           # run before saying anything passes
.venv/bin/python seed.py --reset         # wipe + reload from ../Memorable Numbers.md
.venv/bin/python admin.py add you@x.test # the first operator; there is no signup
.venv/bin/python admin.py hide 42        # take an entry off the public wiki
.venv/bin/uvicorn main:app --reload
```

Env overrides: `NAMBA_DB`, `NAMBA_UPLOADS` (the tests use both to stay
hermetic), `NAMBA_SECRET` (the key the client hashes are salted with -- and if
it is unset, `secret.key` beside the database is generated and used instead).

## Load-bearing details

- **`check_same_thread=False` in `db.connect()` is not cruft.** FastAPI opens the
  connection in one threadpool thread and runs the endpoint in another. Removing
  it produces 500s only under concurrent requests — a single curl passes, and so
  does `TestClient`, which funnels everything through one portal thread.
  `test_connection_crosses_threads` is the guard; it spawns a real thread.
- **`PRAGMA journal_mode = WAL` in `db.init()` is not a tuning knob.** Every page
  load reads this file, because `/p/42` carries its own `<head>`; under the
  default rollback journal one save takes an exclusive lock and every reader
  waits it out, then gets a 500 when the 5s busy timeout expires. The mode lives
  in the file header, so it is set once and inherited — which also means the
  database will not live on a filesystem without shared-memory locks (NFS, SMB).
- **`revisions` has no foreign key on purpose.** It is the only thing between
  vandalism and permanent loss on a wiki nobody logs into, so the rows must
  outlive the post. Every edit and every restore snapshots first; **hiding does
  not**, because nothing about the entry changed except whether the wiki shows
  it, and `show` is the undo. Adding `REFERENCES posts(id) ON DELETE CASCADE`
  would silently make `admin.py purge` unrecoverable and, worse, quietly turn
  the rows left by the `DELETE` route that used to exist into nothing.
- **`comments` is the same decision inverted, on purpose.** It *does* have the
  foreign key and it *does* cascade, because talk beside an entry has nothing to
  recover. Hiding an entry does not fire it — the row stays, so the talk is
  hidden and comes back with the entry. The cascade is for `admin.py purge`,
  where taking the talk along is exactly the point (`test_comments` asserts
  both halves). It is also never snapshotted, which is
  why it is its own endpoint rather than a key on `fetch_one` — anything attached
  there rides into every revision taken afterwards. `add_comment` leaves
  `updated_at` alone for the same reason: a remark is not a rewrite and must not
  carry the entry back up the Recent feed.
- **Do not delete the picture when the entry goes.** `restore_revision` hands
  back the image path the entry had, so a file no live entry shows may be the one
  a restore needs -- an `os.remove` on an image swap turns a recoverable edit
  into a broken picture. `admin.py purge` is the one place a picture is deleted,
  and it asks `gc_uploads.referenced()` first, *after* the rows are gone, so a
  path another body or snapshot still carries survives. Orphans are otherwise
  collected out of band by
  `gc_uploads.py`, which counts bodies and snapshots as references and leaves
  anything younger than a day alone, because a picture is uploaded before the
  entry is saved and an unsaved form looks exactly like rubbish.
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
- **`admin_api.py` must not import `main`.** `main.py` imports it and includes
  the router, so the arrow only points one way. Everything both need lives
  below them — `db.py` (`get_db`, `now`, the schema), `events.py`, `auth.py`.
  That is also why `get_db` is in `db.py` rather than beside the routes that use
  it. The router is included where the app is built, well above the catch-all,
  because Starlette matches in the order routes are added.
- **The operator's login is deliberately the smallest correct one.** stdlib
  `hashlib.scrypt` and not bcrypt or passlib; an opaque token and not a JWT,
  because logout and revoking an account have to bite on the next request; only
  the token's sha256 in `admin_sessions`, so a leaked database is a list of dead
  tokens. `verify()` reads the cost parameters back out of the stored hash, so
  raising `N` later leaves every existing password working. `login` runs scrypt
  against `auth.DUMMY` when the email is unknown and answers "wrong email or
  password" either way — the response time and the message are both free
  directories otherwise. Five attempts a minute, against the write limiter's
  twenty.
- **`SameSite=Strict` is standing in for a CSRF token, and `allow_credentials`
  must stay off.** The admin app is same-origin with the API, so no legitimate
  request is cross-site and the browser will not attach the session cookie to
  one; the JSON content type on every write is the second layer, since it costs
  a preflight. `CORSMiddleware` is wide open on purpose — an open wiki's API
  should be readable from anywhere — and that is only safe while credentials are
  off. Turning them on undoes both layers at once. `test_admin_accounts` asserts
  it stays off.
- **An account is revoked, never deleted.** Every audit row in `events` points
  at an `admins.id`, and an operator who leaves must not take their record with
  them. `active = 0` is in the session join, so it takes effect on the next
  request; `admin.py` also drops the live sessions, and the test checks the join
  separately so the tidy-up cannot hide it.
- **A count only counts if it counts people.** `_already_open` refuses a second
  pending delete request or open report from the same visitor, keyed on the
  `namba_cid` cookie when there is one and on the IP hash only when there is
  not. An office, a school and a mobile carrier are each one address for
  hundreds, and refusing the second of them is a worse failure than a count a
  determined spammer can pad — which the write limiter caps anyway. Not a UNIQUE
  index, because NULL is distinct from NULL in one and the constraint would miss
  precisely the cookieless half.
- **Approving one delete request closes the rest on that entry; rejecting one
  does not.** They were all asking for what just happened, and leaving them open
  shows five rows for one decision already made. A rejection is about its own
  reason and closes its own row alone.
- **`decide_reports` does nothing to the entry, on purpose.** Hiding it, editing
  it and blocking whoever wrote it are separate routes with separate audit rows.
  Folding them in would be one button that does four things and logs one.
- **`events` is append-only, and that is the feature.** Nothing in this codebase
  issues an `UPDATE` or a `DELETE` against it. An audit log an operator can tidy
  up after themselves in is not an audit log, so do not add a route that edits
  one, and do not "clean up" old rows without saying so out loud. It has no
  foreign keys for the reason `revisions` has none — a record of what happened
  to a thing outlives the thing — and `target_id` points at four different
  tables anyway. `admin_id` is the whole split: `NULL` is a visitor, set is an
  operator's own decision, which is why the activity feed and the audit log are
  one table with two filters rather than two tables of the same shape.
- **`events.SECRET` must survive a restart or every hash in the database goes
  quiet.** No raw address is stored anywhere — not in `events`, not in the write
  limiter's dict, not in a log line this code writes — so an IP is only ever a
  salted sha256, and a block is written against that hash. Change the key and
  every stored block stops matching and nothing fails: it is the one setting
  here whose loss is silent. `NAMBA_SECRET` wins; otherwise `secret.key` is
  written beside the database at 0600, by `os.open` with the mode at creation
  rather than a `chmod` afterwards. **It belongs in the backup with the
  database.**
- **`guard` replaced `rate_limit` and hands back an identity.** It is still the
  single `Depends` on every write, it still refuses at 20 a minute, and it now
  returns the caller's three hashes so a route can record what happened without
  asking twice — hence `who=Depends(guard)` on the nine writes that log and
  `_=Depends(guard)` on the two that do not. `like` and `unlike` are the two:
  a like says nothing about the entry and at one row per tap the abuse view
  would be nothing else. The limiter counts hashes now, not addresses.
- **`now()` lives in `db.py`.** It is a property of the schema — every date
  column is written by it — and `events.py` needs it without importing the app.
  `main.py` imports the name, so `main.now` is still what `test_recent_sort`
  monkeypatches.
- **The client cookie is set on the document and nowhere else.** `spa()` sets
  `namba_cid` when the request arrives without one. A middleware would set it on
  every asset of the first page load and the last response to arrive would win;
  this way a page load sets it once. In development Vite serves the document, so
  there is no cookie and the abuse view has the IP hash alone — which is also
  what it falls back to for anyone who clears theirs.
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

No auth on the public half means the input validation *is* the security model
there. The operator's half has a login, and the notes above are the whole of it.

- Nothing the API offers removes a row. `posts.status` is the whole of
  moderation and `LIVE` is the condition nine public reads carry; the list of
  them is in `main.py` above the constant, and `test_hidden_is_invisible` walks
  all nine. A new public read that touches `posts` joins that list, or it leaks
  the body of something an operator took down.

- Uploads: extension allowlist, 5 MB per file, `UPLOAD_TOTAL_MAX` for the
  directory, and the filename is always `uuid4().hex + ext`. Never build a path
  from `file.filename`. The total matters because 20 writes a minute times 5 MB
  fills the disk the database is on.
- Pydantic length caps on every field. Tags are checked for shape, not
  membership — there is no `TAGS` list any more. `_clean_tags()` folds case and
  whitespace, refuses a blank and a slash, and holds `TAG_MAX` (24) and
  `TAGS_PER_POST` (2). Those two numbers are the row in the root `CLAUDE.md`
  that is hand-copied into `api.ts`; the vocabulary is not.
- Comments: `COMMENT_MAX` (300) on the body, 40 on the nickname, blank refused,
  and the write limiter above. That is the whole moderation story — there is no
  edit and no delete, deliberately: with no accounts a Remove button belongs to
  nobody, so it is one stranger's button over everyone's words, and a comment has
  no revision to fall back to. If spam ever needs answering, the next step is a
  delete plus something to undo it, not a delete on its own.
- Write rate limit is a per-process in-memory dict, 20 a minute per IP *hash*.
  It is per-worker; run one worker or move it to redis. Reads are not limited
  and are not identified — there is nothing to record about a page view.
- Likes are a bare counter, and rate limited like every other write. The
  browser's `localStorage` stops an accidental second vote; the limiter is what
  stops a script. Deliberately naive beyond that.
- `/api/posts/{id}/revisions` returns the newest `REVISIONS_SHOWN` (50), not the
  table. A snapshot is the whole entry and the edit form opens with this list.

## Tests

`test_namba.py` is plain asserts run by `if __name__ == "__main__"` — no pytest,
no fixtures. Add cases to the existing functions. A test that cannot fail is
worse than no test: if you add one, break the code once and confirm it goes red.
