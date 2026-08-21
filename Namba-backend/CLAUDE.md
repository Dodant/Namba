# Namba-backend

FastAPI over stdlib `sqlite3`. Ten files:

| | |
|---|---|
| `main.py` | the wiki's routes and models |
| `admin_api.py` | the back office's routes, under `/api/admin` |
| `store.py` | reading and writing one entry — the pieces both APIs need |
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
  below them — `db.py` (`get_db`, `now`, the schema and the five vocabularies),
  `events.py`, `auth.py`, and `store.py` for `fetch_one`, `shape`, `snapshot`,
  `guard_public`, `write_tags` and `write_translations`. That layering is the
  only reason `store.py` exists: put a shared entry helper there, not in
  `main.py`, or the admin router cannot reach it without a cycle. The router is included where the app is built, well above the catch-all,
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
  must stay off.** Those are the two layers, and there is no third. The admin
  app is same-origin with the API, so no legitimate request is cross-site and
  the browser will not attach the session cookie to one; and a *credentialed*
  cross-origin request against `Access-Control-Allow-Origin: *` is refused by
  the browser before it leaves. `CORSMiddleware` is wide open on purpose — an
  open wiki's API should be readable from anywhere — and that is only safe
  while credentials are off. `test_admin_accounts` asserts it stays off.
  This entry used to name the JSON content type as a second layer, "since it
  costs a preflight". It costs one, and the preflight passes:
  `allow_headers=["*"]` answers `content-type` with a 200 for any origin. The
  layer was never there, which is exactly the sort of thing to know before
  turning credentials on in the belief that one is held in reserve.
- **`admin.py` asks for a password on a terminal, reads one from a pipe, and
  never takes one from argv.** argv is refused because it would sit in the shell
  history. The pipe branch exists because `getpass` cannot turn echo off without
  a tty — `docker exec`, a deploy script, or Claude Code's own `!` shell — and
  raised `termios.error` and then `EOFError` on top of it, printing a traceback
  instead of saying what was wrong. It now says which of the two to use and that
  a pipe costs you the history a terminal does not.
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
- **A block stops writing and nothing else.** `guard` checks `blocks` before it
  checks the window, both hashes in one query. Reads never reach it: barring
  somebody from reading an open wiki achieves nothing, since the wiki is open.
  The operator's own routes do not depend on `guard`, so an operator who blocks
  their own address can still work — and `test_blocking` asserts every read
  still answers 200 while every write is 403.
- **Two kinds of block, because neither is enough.** An address catches a
  browser with its cookies cleared; a cookie catches the same person on a new
  address. Neither is proof of who anybody is, which is why `expires_at` exists
  and why permanent has to be asked for explicitly (`hours: None`, not the
  default). Lifting sets `lifted_at` rather than deleting the row — "we blocked
  this and then let it back in" is something an operator needs to be able to
  read, and a `DELETE` says only "we never did".
- **`FLAGGED` is a count, not a column.** `/api/admin/posts` returns
  `open_reports` and `pending_requests` per row and the panel draws the badge
  from them. A stored `FLAGGED` status would go stale the moment a report was
  resolved, and `reports` is already the truth — the test resolves one and
  checks the badge goes with it.
- **`/api/admin/posts` is the only list that does not carry `store.LIVE`, and
  `one_post` is the only read that passes `hidden=True`.** That is what the back
  office is for. If a third caller ever wants `hidden=True`, look hard at it
  first.
- **`hidden` travels all the way down into `snapshot()`.** It reads through
  `fetch_one`, so without it an operator reverting vandalism gets a 404 in the
  middle of their own restore — an entry worth reverting is usually one they took
  down first. This was a real bug caught by `test_admin_content_and_dashboard`,
  not a hypothetical.
- **The admin revisions list does not ship snapshots.** It reads them to pull a
  title out as a label and drops them: fifty whole entries is megabytes, and
  `/diff` fetches the two actually being looked at. `revision_number` is the
  position in that list rather than a column — it only means anything in the
  order it is read in.
- **The diff answers fields and body separately.** A changed sort key inside a
  unified text diff is unreadable, and "the number was quietly changed" — the
  thing an operator is usually hunting — is a field, not a line. `difflib`
  because it is stdlib; a diff library on the front end would be a dependency
  for what this already does.
- **`set_admin_active` refuses only self-revocation, and that is deliberate.**
  `require_super` means whoever is asking is a live super admin, so revoking
  anybody *else* always leaves at least them. A separate "not the last super
  admin" check existed for one commit, could never fire, and was deleted — a
  guard that reads as protection and is unreachable is worse than none. Locking
  the door stays possible from a shell, which is the right place for it.
- **The duplicate finder is keyed on the body, and that took three tries.**
  Grouping by title put "Time" at the top of the real wiki — five people writing
  about five different numbers called Time, which is the wiki working. Counting
  distinct bodies beside the title did not save it either: all five have no body,
  so they shared the empty string and scored as maximum repetition. A shared
  title is simply not evidence here and a shared paragraph is, so the title
  version is gone rather than patched again, and `length(trim(body)) > 20` keeps
  the empty ones out. Title-only spam is caught by the client counts, which is
  the tool that fits it: one visitor, twelve creates, ten minutes.
  `test_admin_content_and_dashboard` holds all three cases.
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
- **The catch-all serves two documents.** `/admin` and everything under it get
  `dist/admin.html`; everything else gets `dist/index.html`. The admin branch
  comes first and before the asset lookup, and it writes no `og:` head and sets
  no `namba_cid` — nothing in there is shareable and an operator is not a visitor
  being counted.
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
  fills the disk the database is on. Nothing looks *inside* the file, so a
  `.png` full of markup is uploadable — `/uploads` is the one place a
  stranger's bytes come back off this origin, and what keeps the guessed
  content type binding is the `nosniff` header the `_nosniff` middleware puts
  on every response. Content sniffing was the whole attack; a magic-number
  check would be the larger, later answer.
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
  and are not identified — there is nothing to record about a page view. Past
  `KEEP_CLIENTS` keys the dict drops the ones whose last write is outside the
  window: only the timestamps *inside* a key used to expire, so a long-lived
  worker kept an entry for every address that ever wrote. `auth._attempts` does
  the same two lines for the login limiter and repeats them rather than sharing
  — `auth` may not import `main`.
- Likes are a bare counter, and rate limited like every other write. The
  browser's `localStorage` stops an accidental second vote; the limiter is what
  stops a script. Deliberately naive beyond that.
- `/api/posts/{id}/revisions` returns the newest `REVISIONS_SHOWN` (50), not the
  table. A snapshot is the whole entry and the edit form opens with this list.

## Tests

`test_namba.py` is plain asserts run by `if __name__ == "__main__"` — no pytest,
no fixtures. Add cases to the existing functions. A test that cannot fail is
worse than no test: if you add one, break the code once and confirm it goes red.
