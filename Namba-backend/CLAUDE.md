# Namba-backend

FastAPI over stdlib `sqlite3`. Fifteen Python files, including the test suite:

| | |
|---|---|
| `main.py` | the wiki's routes and models |
| `seo.py` | the `<head>` written for a crawler, and the locale it is written in |
| `admin_api.py` | the back office's routes, under `/api/admin` |
| `store.py` | reading and writing one entry — the pieces both APIs need |
| `db.py` | schema, `connect()`, `get_db()`, `now()`, `nfc()`, where the files live |
| `events.py` | who a request is from, as hashes, and the log of what they did |
| `auth.py` | operator passwords, sessions and the `require_admin` dependency |
| `numfmt.py` | value parsing |
| `seo_locale.py` | localized metadata prose and Open Graph locale codes |
| `test_namba.py` | the backend and cross-app checks |
| `seed.py` + `seed_tags.py` | the markdown importer |
| `gc_uploads.py` | the uploads collector |
| `admin.py` | the operator's shell commands |

The last two run from cron and from a shell, never from a route — there is
nobody to stop a stranger triggering one.

**Backups are not in this repository.** `chiral-root/scripts/namba-backup.sh`
on the host takes them, beside the backup for the other stack sharing that
box: SQLite's online backup API rather than `cp` (a WAL database is two files
and `cp` of one of them tears), gzipped to S3 daily, with `uploads/` synced
incrementally and `secret.key` beside it. The README says what is covered and
how to restore.

```sh
.venv/bin/python test_namba.py           # run before saying anything passes
.venv/bin/python seed.py --reset         # wipe + reload from ../Memorable Numbers.md
.venv/bin/python admin.py add you@x.test # the first operator; there is no signup
.venv/bin/python admin.py totp-enroll you@x.test # mandatory second factor
.venv/bin/python admin.py hide 42        # take an entry off the public wiki
.venv/bin/uvicorn main:app --reload
```

Env overrides. `NAMBA_DB` and `NAMBA_UPLOADS` are read in `db.py`, beside each
other because they answer one question: where this install keeps what outlives
the process. The tests set both to stay hermetic. `NAMBA_SECRET` is the key the
client hashes are salted with; if it is unset, `secret.key` beside the database
is generated and used instead.
`NAMBA_TOTP_SECRET` may provide a separate root for operator TOTP keys; when it
is unset the same durable installation key is used with domain separation.
Whichever root was used for enrollment must not be rotated without re-enrolling
every operator.

`NAMBA_DIST` selects the built frontend directory (default: `../Namba-frontend/dist`);
`NAMBA_UPLOAD_TOTAL_MB` sets the uploads directory cap in MiB (default: `1024`);
`NAMBA_BASE_URL` overrides the request-derived base URL for metadata, robots and
the sitemap.

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
  would silently make `admin.py purge` unrecoverable and turn the snapshots
  whose entry row is gone into nothing (ADR-0003).
- **`comments` is the same decision inverted, on purpose.** It *does* have the
  foreign key and it *does* cascade, because talk beside an entry has nothing to
  recover. Hiding an entry does not fire it — the row stays, so the talk is
  hidden and comes back with the entry. The cascade is for `admin.py purge`,
  where taking the talk along is exactly the point (`test_comments` asserts
  both halves). It is also never snapshotted, which is
  why it is its own endpoint rather than a key on `fetch_one`. That used to be
  the whole guard and is now the second one: `store.SNAPSHOT_FIELDS` names
  what a revision keeps, so a key added to `fetch_one` no longer rides into
  every revision taken afterwards (ADR-0023). `add_comment` leaves
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
  the same, crediting whoever pressed Restore. A new column is a step in
  `db.MIGRATIONS` too — `CREATE TABLE IF NOT EXISTS` skips existing
  databases.
- **`PostIn` and `PostPatch` differ in their field types and in nothing else.**
  What a value, a title, a tag list and a format may contain is the same
  question for a create and for an edit, and the four validators answering it
  were written out twice, byte for byte. They are on `PostRules`, which both
  inherit, with `check_fields=False` because the subclasses declare the fields.
  A new rule about a field goes there once; a new *field* goes on whichever of
  the two is sending it.
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
  Both list endpoints take `lang` and run it through `_in_lang()`; no `lang`
  substitutes nothing, and neither endpoint assumes English. A post
  with no translation in that language keeps its own title and body — that
  fallback is the feature, not a gap. `fetch_one` deliberately does **not**
  translate: the single-post view has a tab strip, and switching there is the
  reader's own move. The front end defaults to the empty string ("As written")
  and passes the footer preference to `PostPage`, which selects a matching
  translation locally while preserving the tab strip.
- **`posts.grouped` is how the number is written, not what it is.** `value`
  never carries separators and always uses a dot decimal; `grouped_value()`
  applies the requested UI locale for display and leaves anything that is not
  a plain integer or decimal alone. `ungroup()` treats `number_locale` as input
  grammar and takes valid localized separators back out **whatever the box
  says** — English `1,000.5`, German `1.000,5` and French `1 000,5` all answer
  at `/n/1000.5` — and returns the flag alongside the value, because typing a
  grouping mark is itself a way of asking for one. An invalid grouping pattern
  (`1,2,3`, `Apollo,11`) is left where it is. In `/api/numbers` a row is grouped
  only when every entry filed under it is: one number, one spelling, and a
  disagreement falls back to the plain form nobody had to opt into.
- **`admin_api.py` must not import `main`.** `main.py` imports it and includes
  the router, so the arrow only points one way. Everything both need lives
  below them — `db.py` (`get_db`, `now`, the schema and the seven vocabularies),
  `events.py`, `auth.py`, and `store.py` for `fetch_one`, `shape`, `snapshot`,
  `guard_public`, `section_where`, `write_tags` and `write_translations`. That
  layering is the
  only reason `store.py` exists: put a shared entry helper there, not in
  `main.py`, or the admin router cannot reach it without a cycle.

  **`seo.py` is the same arrow one step further out.** `main.py` imports it and
  hands it a document, so nothing in it may import main either, and what it
  needs is below both: `store.py` for `LIVE` and `section_where`, `numfmt.py`
  for `grouped_value`, `seo_locale.py` for the words. It is four hundred lines
  that were in `main.py` and had nothing to do with the wiki's API — no route,
  no model, and no file of its own to read, since `main.py` owns where `dist/`
  is. Reaching for `main` from in there is the cycle this split exists to make
  impossible, so if a head ever needs something from the API, that something
  moves down rather than the import going up. The router is included where the app is built, well above the catch-all,
  because Starlette matches in the order routes are added.
- **The operator's login is deliberately the smallest correct one.** stdlib
  `hashlib.scrypt` and not bcrypt or passlib; an opaque token and not a JWT,
  because logout and revoking an account have to bite on the next request; only
  the token's sha256 in `admin_sessions`, so a leaked database is a list of dead
  tokens. `verify()` reads the cost parameters back out of the stored hash, so
  raising `N` later leaves every existing password working. `login` runs scrypt
  against `auth.DUMMY` when the email is unknown and answers "wrong email or
  password" either way — the response time and the message are both free
  directories otherwise. A correct password creates a five-minute opaque
  challenge, not a session; `/login/totp` exchanges that and one unused RFC 6238
  counter for the existing cookie. Both stages have five-attempt rate limits,
  and each challenge also keeps its attempts in SQLite so a restart cannot
  refill it.
- **`SameSite=Strict` is standing in for a CSRF token, and `allow_credentials`
  must stay off.** Those are the two layers guarding the admin session, and
  there is no third. The admin app is same-origin with the API, so no
  legitimate request is cross-site and the browser will not attach the session
  cookie to one; and a *credentialed* cross-origin request against
  `Access-Control-Allow-Origin: *` is refused by the browser before it leaves.
  `test_admin_accounts` asserts credentials stay off.
- **The public API is readable from any origin and writable from this one.**
  Every public guard counts per IP hash and assumes an attacker has few
  addresses; a page on another site writing here through its visitors'
  browsers has all of theirs, and a block aimed at it lands on the visitors.
  Two layers, because a browser has two ways to send a cross-origin write:
  `CORSMiddleware` allows `GET`, `HEAD` and `OPTIONS` only, so a JSON body's
  preflight is answered 400; and `guard` refuses `Sec-Fetch-Site: cross-site`,
  which catches the requests that never preflight (a body with no content
  type, a multipart form). A client that is not a browser sends neither and is
  unaffected, which is what "open, no key" means. `same-site` passes so a page
  on `chiral.kr` may still write to `namba.chiral.kr`.
  `test_cross_site_writes_are_refused` holds both layers.
- **`admin.py` asks for a password on a terminal, reads one from a pipe, and
  never takes one from argv.** argv is refused because it would sit in the shell
  history. The pipe branch exists because `getpass` cannot turn echo off without
  a tty — `docker exec`, a deploy script, or Claude Code's own `!` shell — and
  raises `termios.error` there; the branch reads one line instead and, when
  nothing arrives, says which of the two to use and that a pipe costs you the
  history a terminal does not.
- **TOTP enrollment and recovery are shell-only.** `admin.py totp-enroll` shows
  a manual setup key only on an interactive terminal, verifies one current code
  before committing it, and revokes sessions. The key is derived with HMAC from
  the installation secret, operator id and enrollment generation; the database
  holds only the generation and last accepted counter. Re-running the command
  is the lost-device recovery path. There is no QR or recovery endpoint whose
  compromise could silently replace the second factor.
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
- **`guard_public` answers "is there anything here" rather than "is there a
  row".** A 404 from it means there is nothing at this id and nothing was; a
  200 means there is something, or something recoverable. Three cases: a row
  that is not `LIVE` is a 404, because an entry an operator took down has a
  history that is nobody's business until they put it back; an absent row with
  nothing behind it is a 404, which is the case that used to answer `200 []`
  and so claimed an entry existed and had no history; an absent row with
  snapshots behind it passes, because `/api/posts/{id}/revisions` is where
  `PostPage` reads what it is offering to restore, and a strict rule would
  close the recovery path by closing the read that draws it. The second query
  runs only on the absent path. `test_an_entry_that_never_existed_is_a_404`
  holds all three (ADR-0002).
- **`/api/admin/posts` is the only list that does not carry `store.LIVE`, and
  `hidden=True` is confined to the back office.** `one_post`, the current side
  of a diff, and the status/restore handlers use it to read moderated entries;
  snapshots during admin restore use it too. A public caller must not pass it.
- **`hidden` travels all the way down into `snapshot()`.** It reads through
  `fetch_one`, so without it an operator reverting vandalism gets a 404 in the
  middle of their own restore — an entry worth reverting is usually one they took
  down first. `test_admin_content_and_dashboard` restores a hidden entry to
  hold it.
- **The number itself is an operator's edit, and the only route that is.**
  `POST /api/admin/posts/{id}/value` is the one place `posts.value` is changed
  on purpose. The wiki's own form keeps that field read-only, because `/n/42`
  is a query on this column: a stranger retyping it does not correct an entry,
  it moves the entry to a page about a different number and leaves 42 short a
  meaning. Refusing that to anonymity and allowing it to a name is the whole
  shape of the operator exception, so the route pays for it -- it snapshots
  first with `hidden=True` (a number worth fixing is often on an entry already
  taken down), settles the value through the same `ungroup` and
  `resolve_format` the wiki's two writes call, writes `edited_by` and never
  `author`, and leaves a `CONTENT_RENUMBER` row pointing at the revision. It
  answers 409 rather than writing a revision that changes nothing.

  Which is why `ungroup` and `resolve_format` live in `store.py`: three writes
  settle a value, one of them in a module that may not import `main`, and a
  second answer to how a value is spelled and which format it is filed under is
  two addresses for one entry. The format travels with the value because it has to -- 1969
  retyped as 10:04 is a TIME, and an entry deliberately filed as Mixed must not
  jump to `/a/` the first time a typo in it is fixed, so the panel sends the
  format it is showing.

  `PATCH /api/posts/{id}` still accepts a `value` and is left alone. It is the
  same column the restore path writes, and the wiki says no in the form rather
  than in the model -- worth knowing before treating the read-only field as the
  enforcement.
- **`events` is joined on `revision_id`, so it is indexed on it.** The admin
  revisions list turns "someone" into an action and a client hash through that
  join, and without `idx_events_revision` the plan is `SCAN e` over the one
  table here that only ever grows — once per entry whose history gets opened,
  and the entry worth opening is the fought-over one with the most revisions to
  join. It is a plain `CREATE INDEX IF NOT EXISTS` inside `SCHEMA`, so unlike a
  new *column* it reaches existing databases with no `ALTER` pass.
- **Neither revisions list ships snapshots, and neither reads one.** Both ask
  SQLite for the label fields with `json_extract`, so a fought-over entry's
  history costs a few hundred bytes a row rather than a whole entry parsed in
  Python to draw a title. `/diff` fetches the two versions actually being
  looked at. The label fields are the ones a history row *reads* through, which
  is why `grouped` and `format` are among them and not only the title and the
  value: without the flag a 1,000 reads as 1000, and without the format a
  25 December reads as 12-25. `number` is the position in the admin list rather than a column —
  it only means anything in the order it is read in. A key a snapshot does not
  carry comes back `NULL`, which is what `snap.get()` answered.
- **The diff answers fields and body separately.** A changed sort key inside a
  unified text diff is unreadable, and "the number was quietly changed" — the
  thing an operator is usually hunting — is a field, not a line. `difflib`
  because it is stdlib; a diff library on the front end would be a dependency
  for what this already does.
- **`set_admin_active` refuses only self-revocation, and that is deliberate.**
  `require_super` means whoever is asking is a live super admin, so revoking
  anybody *else* always leaves at least them. A separate "not the last super
  admin" check could never fire, and a guard that reads as protection and is
  unreachable is worse than none, so there is not one. Locking the door stays
  possible from a shell, which is the right place for it.
- **The duplicate finder is keyed on the body, never the title.** Five people
  writing about five different numbers called Time is the wiki working, so a
  shared title is not evidence here; a shared paragraph is, and
  `length(trim(body)) > 20` keeps the empty bodies — which every title-only
  entry shares — from scoring as repetition. Title-only spam is caught by the
  client counts, which is the tool that fits it: one visitor, twelve creates,
  ten minutes. `test_admin_content_and_dashboard` holds all three cases.
- **`events` is append-only, and that is the feature.** Nothing in this codebase
  issues an `UPDATE` or a `DELETE` against it. An audit log an operator can tidy
  up after themselves in is not an audit log, so do not add a route that edits
  one, and do not "clean up" old rows without saying so out loud. It has no
  foreign keys for the reason `revisions` has none — a record of what happened
  to a thing outlives the thing — and `target_id` points at five different
  tables anyway (`posts`, `reports`, `delete_requests`, `blocks`, `admins`).
  `admin_id` is the whole split: `NULL` is a visitor, set is an operator's own
  decision, which is why the activity feed and the audit log are
  one table with two filters rather than two tables of the same shape.

  **The same read answers five more questions**, which is what keeps it one
  table rather than growing pages: `/api/admin/activity` takes `action`,
  `admin_id`, `ip_hash`, `target_type` + `target_id` and `hours` beside
  `kind`. All exact matches, never `LIKE` -- these are vocabulary and
  identity, and a substring match would make `CONTENT_DELETE` a hit for
  `DELETE` and quietly widen a filter an operator is trusting. `target_type`
  travels with `target_id` because that id points at five tables, so id 5
  alone is post 5 and block 5 and admin 5 at once -- and the pair is what
  `idx_events_target` leads with, so asking both ways is the correct one and
  the fast one. `hours` is checked in the body rather than by `Query(ge=1)`,
  so the whole filter set stays callable as a plain function the way
  `test_a_500_leaves_a_row_in_the_log` calls it (ADR-0025).
- **`events.SECRET` must survive a restart or every hash in the database goes
  quiet.** No raw address is stored anywhere — not in `events`, not in the write
  limiter's dict, not in a log line this code writes — so an IP is only ever a
  salted sha256, and a block is written against that hash. Change the key and
  every stored block stops matching and nothing fails: it is the one setting
  here whose loss is silent. `NAMBA_SECRET` wins; otherwise `secret.key` is
  written beside the database at 0600, by `os.open` with the mode at creation
  rather than a `chmod` afterwards. **It belongs in the backup with the
  database.** Unless `NAMBA_TOTP_SECRET` is explicitly set, it is also the root
  from which domain-separated operator TOTP keys are derived, so losing it now
  makes enrolled authenticators stop matching as well.
- **`guard` replaced `rate_limit` and hands back an identity.** It is still the
  single `Depends` on every write, it still refuses at 20 a minute, and it now
  returns the caller's three hashes so a route can record what happened without
  asking twice — eleven writes log, ten binding `who=Depends(guard)` and
  `put_translation` binding `client=Depends(guard)`. The two that do not log
  bind `_=Depends(guard)`. `like` and `unlike` are the two:
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
- **`/robots.txt` and `/sitemap.xml` are routes, and they are declared above the
  catch-all** for the reason directly above. Both are dynamic because both name
  the site's own address, and there is no configured domain in this repo to
  build one from — `site_base()` answers with `request.base_url` unless
  `NAMBA_BASE_URL` is set, which is what a reverse proxy that drops
  `X-Forwarded-Proto` needs so that canonicals on an https site do not all say
  http.

  **`robots.txt` allows the AI crawlers on purpose.** One `User-agent: *` group
  and no rule naming GPTBot, ClaudeBot or PerplexityBot: everything readers
  write here is CC0 and the footer invites anyone to "take it, quote it, feed
  it to a machine", so blocking them would contradict the licence the site
  states on every page. If that is ever to change it changes here *and* in the
  footer. `test_robots_and_sitemap` checks the robots rules; it does not inspect
  the footer copy.

  `Disallow` covers only `/admin` and `/api/`. Everything else that should stay
  out of a result carries a `noindex` meta instead, because a path disallowed
  in `robots.txt` can never be crawled to *find* that meta — an old link to one
  sits in an index as a bare URL for good.
- **Seven routes get their `<head>` written server-side, and everything else
  is told not to be indexed.** `seo.index_html()` is the one place that decides
  which:
  `/` gets the site's own head, `/n/{value}`, `/a/{value}`, `/c/{value}` and
  `/t/{tag}` get a title, description and `ItemList` naming the entries filed
  there, `/p/{id}` gets `og_head()`, and `/guide` gets its own article summary.
  The three value pages are one `head_list()` saying different words — what a
  number means, what an abbreviation stands for, what happens on a date. A
  date's `<head>` says `12-25` rather than 25 December: the sentence around it
  is localized and the date is not, because rendering it there means twelve
  month names in seven languages in `seo_locale.py` to agree with a line the
  client already draws from `Intl`. No crawler
  runs the JavaScript that would set any of it client-side — that is the reason
  the API serves the front end at all, and `Namba-frontend/CLAUDE.md` says
  nothing in that app should try.

  **The last branch is a default, not a list of routes, and that is the
  design.** `/search`, `/random`, `/new`, `/p/{id}/edit`, an entry an operator
  hid and every mistyped path all fall into it and all get
  `robots: noindex, follow`. A list of them here would be a second copy of
  `App.tsx`'s `<Routes>`, and a route added there would arrive claiming to be
  indexable until somebody remembered this file. Being indexable is the thing
  that has to be spelled out.

  Everything is `html.escape`d — entry titles are written by strangers and land
  inside an attribute — and everything in the JSON-LD has its `<` escaped,
  because `</script>` inside a JSON string ends the block for the HTML parser
  whatever the JSON makes of it. `og_summary()` is a simpler cousin of
  `plain()` in the front end's `format.ts`; they are deliberately not kept in
  step, since one feeds a preview row and the other a meta tag and nobody sees
  both at once.

  **Metadata chrome follows the UI locale; contributed content does not.**
  `request_ui_locale()` chooses the explicit `namba_ui_locale` cookie before
  the weighted `Accept-Language` header. `seo_locale.py` is the server's one
  table for the home and guide blurbs, counts, list summaries, empty states,
  entry fallback descriptions and share-card alt text. The same choice writes
  `<html lang>`, `Content-Language`, `og:locale` plus its alternates, and the
  `inLanguage` on `WebSite` and `CollectionPage`. An Article still uses the
  entry's free-form `posts.lang`; a French interface around a Korean entry is
  French site metadata containing Korean contributed content, not a French
  translation of that content. Canonicals carry neither choice, and `Vary:
  Accept-Language, Cookie` keeps cached variants apart.
- **Every page falls back to one share card, and it is a file, not a route.**
  `OG_CARD` is `og.png` in the front end's `public/`, so Vite copies it into
  `dist/` and the catch-all serves it like any other build output — there is no
  image code in this app and no dependency that draws one. `og_tags()` reaches
  for it whenever a page has no picture of its own, which is **every page**:
  not one entry in this wiki has an image, so the fallback is the normal case
  and an entry's own picture is the exception. That is also why `twitter:card`
  is now always `summary_large_image` rather than a ternary — before the
  fallback existed, every pasted Namba link came out a bare grey box.

  An empty `/n/` or `/t/` gets the card too, `noindex` notwithstanding: the two
  do not consult each other, one is about a search result and the other about
  what a chat window draws. The `noindex` **default** branch is the one place
  with no card — `/search`, `/new` and a mistyped path keep the head
  `index.html` shipped, which still unfurls as the site's title and blurb
  without an image. Left that way on purpose: giving it a card means giving it
  a `og:url`, and the branch stays dumb by design.

  `og:image:alt` rides only with the fallback, because this file knows what
  that card reads. An uploaded picture has no alt text stored anywhere and a
  title is a caption for the entry, not a description of the image — writing
  one from it would be inventing it.

  `test_the_share_card_is_a_real_png` reads the IHDR chunk by hand and holds
  the file at 1200×630. It is the shape Facebook, Slack and Twitter all crop
  from, and a resized card would be cut somewhere nobody chose with nothing
  else in the repo to notice.
- **`path_seg()` reads the raw path, and `enc()` has to match
  `encodeURIComponent`.** A value may hold a slash — `11/22/63` — so by
  the time ASGI has decoded the path, `n/11%2F22%2F63` and a three-segment path
  are the same string; the value comes off `scope["raw_path"]` or `/n/` answers
  about the wrong number. Coming back the other way, `enc()`'s safe set is
  `encodeURIComponent`'s character for character, because `entryPath()` and
  `tagPath()` in `api.ts` build every link that way and a canonical encoded
  differently is a second URL for one page. `test_head_per_route` and
  `test_robots_and_sitemap` both walk an awkward value.
- **The canonical drops the query string.** `?view=feed`, `?format=` and
  `?tag=` re-sort or filter one index, and `?tag=book` is the page `/t/book`
  already is — four addresses for one page, and the canonical says which one
  counts.
- **`/api/numbers` is an ordered scan grouped in Python, not a `GROUP BY`.** The
  home list needs each number's entry titles, so aggregating and then re-querying
  for them would be two passes to build one thing. It returns `entries`, not a
  `count` — each entry carries `id`, `title`, `body` (the first 140 characters,
  with an ellipsis if truncated), `image` (a boolean) and `likes`, without full
  bodies, tags or dates.
- **A snapshot has its own shape, and translations are in it.**
  `store.SNAPSHOT_FIELDS` plus the tags and the translations is what
  `snapshot_of()` builds and `snapshot()` stores — not `fetch_one`'s dict,
  which is the single-post *view* and would make every key added there part of
  the storage format for good (ADR-0023). Translations being in the list is
  the whole reason a removed one is recoverable, and why `restore_revision`
  calls `write_translations`. `id`, `status` and `bucket` are deliberately out:
  `revisions.post_id` says which entry, hiding is not content, and a bucket is
  computed from the two fields beside it. Keep translations out of `shape()`
  all the same: the list endpoints must stay lean. `lang` is `COLLATE NOCASE` with `UNIQUE(post_id, lang)`, so the
  `ON CONFLICT(post_id, lang)` upsert is what makes a rewrite an edit.
- **`post_links` always stores `a_id < b_id`** (there is a CHECK). Sort the pair
  before insert or delete; read it back with the `UNION` in `get_post`.
- **`bucket_of` bands INTEGER by magnitude, ABBR by first letter or digit and
  CALENDAR by month** — A to W, `X-Z`, and `0-9` last, off the value since an
  abbreviation has no sort key; `01` to `12`, off the key since a date's is
  `month * 100 + day` and the month is the top of it. Two digits there so that
  no month is spelled like an Integer band, because the sync test compares the
  labels as one set. Nothing else gets a band: a TIME sort key is minutes past
  midnight, so banding 09:41 by magnitude files it under "100". Both
  `list_numbers` and `store.shape` call it, so an index row and a post carry
  the same band; `ABBR_BUCKETS` and `MONTH_BUCKETS` in `api.ts` are the order
  the front end draws them in.
- **`parse_number` is a suggestion.** `11:11` is a clock, `1:29:300` is
  Heinrich's law; nothing in the string distinguishes them, so the poster's
  explicit `format` wins in `resolve_format`. Letters go to ABBR the same way,
  and the same override applies: `GROSS` is a word, but somebody filing it as
  Mixed is allowed to mean the number.

  **It does not guess at a date at all**, which is the same argument taken one
  step further: `12-25` is Christmas and `80-20` is a ratio, so `12-25` stays
  a MIXED *suggestion* and CALENDAR is only ever reached by being picked.
  `test_parse` pins it, along with `40-40`, `24/7` and `11/22/63`, so a branch
  added here cannot quietly re-file them.
- **`resolve_format` hands the value back, not just the format.** Settling
  which of the six a value is settles how it is spelled and what its sort key
  is. That is `ungroup`'s argument about separators reached from the other
  end, and it is why all three writes reassign `value` from it — an edit
  arrives with the number field read-only and no value at all, so the check
  has to happen off the stored one.

  It is **pure**, and that is load-bearing: no sibling lookup, so a create
  decides nothing about another row and is the one write with no deciding read
  to hold the lock over (ADR-0007). An ABBR is therefore stored with the case
  it was typed in — `dB` is not `DB` — and one word is still one page because
  the reads fold instead: `list_posts` in the abbr section and `head_abbr`
  compare `NOCASE`, and the sitemap groups the same way, so `/a/ufo` is the
  `UFO` page and its canonical says so (ADR-0005).
- **Five of the six formats are refused when the value does not fit them;
  `is_abbr`, `date_key` and `float()` are the rules.** `ABBR` and `CALENDAR`
  are claims about what the value *is*: Latin letters, digits and `.&/;-` with
  at least one letter; a two-digit month and a day that month has. `INTEGER`
  and `DECIMAL` are the claim that it reads as a number, and the rule is that
  `float()` returns a **finite** one.

  `TIME` is the one still taken at its word — `resolve_format` files an
  explicit `TIME` on `1:29:300` with no sort key, and nothing bands or
  serializes on that key — and `MIXED` is the remainder and claims nothing.

  Every one is a 422 raised from `resolve_format` rather than a Pydantic
  validator, because a validator cannot see both halves — an edit sends a
  `format` and no `value` at all — and because that function is the one place
  all three writes settle the pair. In `edit_post` they are raised **inside**
  `with con`, so a refused edit rolls back the snapshot it had already taken.

  **The finite part is not belt-and-braces.** `float('nan')` and
  `float('inf')` both succeed, and both used to be written: SQLite stores NaN
  as NULL, which is the no-sort-key case and takes the entry off every Integer
  band, and it stores Inf as Inf, which `json.dumps` refuses — so the row was
  committed, the 201 failed to serialize, and `/api/numbers` and `/api/posts`
  then answered 500 for every reader until an operator found it. The `<head>`
  routes and the sitemap were unaffected, which is what made it quiet.

  The check does not touch spelling: `-42`, `1e5`, `1_000` and `٤٢` all read
  and all stay as typed, because two spellings of a number are two entries
  sharing a sort key (ADR-0005). It is `float()` and not a stricter regex for
  the first two of those — `parse_number` guesses neither a minus sign nor an
  exponent, and `bucket_of` already bands a negative by its magnitude.

  `date_key` is the check *and* the sort key, because for a date they are one
  question: a value it cannot read is not a date, and one it can hands back
  `month * 100 + day`. It is strict about the padding on purpose — `1-5` is
  refused rather than folded to `01-05`, since nothing would keep the
  difference and one day has to have one address (ADR-0026). `02-29` passes:
  a leap day is a fixed date with no year to disagree with it.

  It answers a third question in `index_html`: **`/c/{value}` is a page only
  for a value `date_key` can read.** The other two sections are open sets and
  an empty one is a real page inviting the first entry, but there are 366
  days, so `/c/99-99` is not an empty date — it falls through to the same
  noindex head every mistyped path gets, with no canonical claiming it exists.
  `CalendarPage` in `App.tsx` asks `monthDay` at the same boundary, so the
  `<head>` and the page agree.

  Two things the *abbreviation* shape does not say. It is looser than
  `parse_number`'s branch on purpose: `MP3`, `Y2K` and `COVID-19` carry digits and the parser
  will never guess at them, and a gate refusing what a poster explicitly
  picked would be deciding something it was not asked to. And it is not about
  keyboards — `유에프오` and `УФО` are the same abbreviation in another
  alphabet, and one `/a/` page per alphabet is the split the one-spelling
  rule exists to prevent. The entry's own language is not touched: `lang` and the
  translations are as free as anywhere else on this wiki.

  `restore_revision` and `admin_restore` re-check **neither**, the same way
  `write_tags` normalises without validating. A snapshot has to be restorable
  or the history is not a history, and nothing can be written into that state
  any more anyway.
- **`SECTION_FORMATS` is the only thing that tells `/n/` from `/a/` from
  `/c/`.** `list_posts`, `head_number`, `head_abbr` and `head_calendar` ask it
  through `section_where()` and the sitemap through `section_sql()`, so a
  value filed in two sections is two entries at two
  addresses rather than one entry on two pages. It lives in `store.py` for the
  reason `ungroup` and `resolve_format` do: some of those callers are in
  `main.py` and some in `seo.py`, and a second answer to which section a row
  is in would be two addresses for one entry. An unknown section filters
  nothing rather than 422ing, for the reason an unknown `sort` falls back.

  **`edit_post` will not move an entry between sections.** It compares
  `section_of(fmt)` against `section_of(current["format"])` — the format the
  route has *settled*, not the `format` that was sent, so an edit carrying
  only a value is the same 422 and not the way round it. A section is an
  address and the open form does not change addresses;
  `POST /api/admin/posts/{id}/value` is the route that does, with a name, a
  snapshot and an audit row behind it. The one exception is `number` →
  `calendar`, because `parse_number` never returns `CALENDAR`, so picking it
  is all an entry written before somebody noticed it was a date has; `ABBR`
  needs no such door, since the parser already guesses `UFO`.

  It sits **after** `resolve_format`, so `is_abbr` and `date_key` answer
  first: a `MIXED` `국정원` re-filed as `ABBR` still reads "Latin letters" and
  not the section refusal, which is the more useful of the two.

  The cost of leaving it open was not only a moved page. `resolve_format`
  takes an explicit `INTEGER` at its word and swallows `float()`'s
  `ValueError`, so a re-filed `UFO` or `12-25` kept its value and lost its
  sort key, `bucket_of` had no band for it, and the Integer tab draws its five
  bands by filtering on one — the entry answered at `/n/` and under no band.
  It was reachable at **create** time too — `{"value": "9 3/4", "format":
  "INTEGER"}` was a 201 with a null key — and that is closed at the other end
  now, by `INTEGER` and `DECIMAL` being checked rather than believed. The two
  fixes are independent and both are wanted: this one keeps an entry's
  address, that one keeps a number a number.

  Every arm is a plain comparison on the column rather than a `CASE`, so
  `idx_posts_format` is still usable, and **`number` is the remainder**
  (`format NOT IN ('ABBR', 'CALENDAR')`) rather than a listed arm: a seventh
  format arriving with no thought about sections lands at `/n/`, which is the
  safe side. `SECTION_FORMATS` beside it is the one list of them, and
  `section_of()` and `section_sql()` are the same three names read the other
  way — a name for a row's format, and SQL for the sitemap, which needs the
  section as a value to group by rather than as a filter. `value_path()` in
  `seo.py` turns that name into a path and is the twin of `entryPath()` in
  `api.ts`.

## No ORM

Do not add SQLAlchemy, SQLModel, Alembic or a migration tool. Schema lives in
`db.SCHEMA` as `CREATE TABLE IF NOT EXISTS` and runs at import, and a rule
about what a column holds is Pydantic, not a `CHECK` (ADR-0022).

**Anything the DDL cannot reach is a step in `db.MIGRATIONS`** — a column
`CREATE TABLE IF NOT EXISTS` skips on a database that exists, or a pass over
rows written under an older rule. The list is **append-only and in order**: a
step's position is what the file records as done (`PRAGMA user_version`), so
inserting one in the middle re-runs the wrong thing on somebody's database. A
new file is stamped at the end of the list rather than walked through it,
since SCHEMA already declares every column and there are no rows to fold.
Write each step idempotent all the same: every database that exists today is
at version 0 with the work already done by the version of `init()` that asked
on every start, so the first numbered run has to be a no-op on them.

## Trust boundaries — do not thin these out

No auth on the public half means the input validation *is* the security model
there. The operator's half has a login, and the notes above are the whole of it.

- Nothing the API offers removes a row. `posts.status` is the whole of
  moderation and `LIVE` is the condition fourteen public reads carry; the list
  of them is in `store.py` above the constant, and `test_hidden_is_invisible`
  walks all fourteen: eight API reads, five server-written `<head>`s and the
  sitemap. The latter six are places a hidden row can reach somebody who never called the API. A new public read
  that touches `posts` joins that list, or it leaks the body of something an
  operator took down. `head_abbr` arrived with `/a/` and `head_calendar` with
  `/c/`.

- Uploads: extension allowlist, 5 MB per file, `UPLOAD_TOTAL_MAX` for the
  directory, and the filename is always `uuid4().hex + ext`. Never build a path
  from `file.filename`. **An entry's `image` is one of those uploads and
  nothing else**: `PostRules.own_upload` holds it to `UPLOAD_PATH`, a name
  under `/uploads/` with an allowed extension, on both writes. The page draws
  the column into an `<img>`, so an outside URL would be a tracking pixel
  every reader fetches. A restore does not re-check, for the reason
  `write_tags` normalises without validating. The total matters because 20 writes a minute times 5 MB
  fills the disk the database is on. Nothing looks *inside* the file, so a
  `.png` full of markup is uploadable — `/uploads` is the one place a
  stranger's bytes come back off this origin, and what keeps the guessed
  content type binding is the `nosniff` header the `_nosniff` middleware puts
  on every response. Content sniffing was the whole attack; a magic-number
  check would be the larger, later answer.
- **Text is stored in one Unicode normal form, and `db.nfc()` is the fold.**
  Every request model on both APIs inherits `store.Text`, whose one validator
  runs it over every string and list of strings before anything else looks;
  every parameter a read filters on (`value`, `tag`, `q`, `lang`, a path
  segment in `seo.path_seg`) goes through the same function, and
  `write_tags` folds too so a restore cannot write an old spelling back.
  a step in `db.MIGRATIONS` folds rows written before the rule, once, the way
  the lower-case tag pass does. Composed and decomposed Korean are two strings
  to SQLite, and without this "한국어" was two tags, two languages and a
  search that missed -- some macOS apps and every file name hand over the
  decomposed form. `test_api_round_trip` holds the write, the read filters
  and the startup fold.
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
  window, so a long-lived worker does not keep an entry for every address that
  ever wrote. `auth._attempts` does
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
