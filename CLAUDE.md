# Namba

An open, no-login wiki of what numbers mean. Two apps in one git repo, no
monorepo tooling — `Namba-backend` (FastAPI + SQLite) and `Namba-frontend`
(React + Vite). One repo on purpose: the two lists below are hand-copied across
both apps, so keeping them in step has to be a single commit. Full walkthrough
in `README.md`.

## Running

```sh
cd Namba-backend  && .venv/bin/uvicorn main:app --reload   # :8000
cd Namba-frontend && npm run dev                           # :5173, wiki at /, back office at /admin
```

There is no signup, so the first operator comes from a shell:
`cd Namba-backend && .venv/bin/python admin.py add you@example.com`, followed by
`.venv/bin/python admin.py totp-enroll you@example.com`. A password without an
enrolled authenticator never creates a session.

Before claiming anything works:

```sh
cd Namba-backend  && .venv/bin/python test_namba.py   # asserts, no pytest
cd Namba-frontend && npx tsc -b --noEmit && npx oxlint src && npm test && npm run build
```

## Kept in sync by hand

One list is duplicated across the apps on purpose (no codegen, no shared
package). **Change one, change the other:**

| what | backend | frontend |
|---|---|---|
| the 5 formats | `numfmt.py` `FORMATS` | `src/api.ts` `FORMATS` |
| the two tag limits | `main.py` `TAG_MAX`, `TAGS_PER_POST` | `src/api.ts`, same names |
| the moderation vocabularies | `db.py` `DELETE_REASONS`, `REPORT_REASONS`, `POST_STATUSES`, `REQUEST_STATUSES`, `REPORT_STATUSES`, `BLOCK_TYPES`, `BLOCK_HOURS` | `src/api.ts`, same names |
| the index's bands | `numfmt.py` `bucket_of` — computed, not listed | `src/api.ts` `BUCKETS`, `ABBR_BUCKETS` |

`test_the_two_apps_still_agree` in `test_namba.py` reads `src/api.ts` and checks
every row of that table, so "change one, change the other" is a thing the suite
notices rather than a thing you remember.

The last row is the odd one and worth reading twice. The other three are lists
on both sides; that one is a **function** on this side and a list on the other,
so there is nothing to compare literally — the test calls `bucket_of` across
every branch and compares the set of labels it can return against the set the
front end carries. It matters more than the rows above it, too. A vocabulary
that drifts costs a menu item. A band that drifts costs *entries*: `Home.tsx`
renders one band per member of those lists and fills each with
`rows.filter(n => n.bucket === b)`, so a label the front end does not carry is
entries that are on the wiki and on no page. The comparison is a set equality
in both directions, because the other way round is a heading with nothing
under it. It parses the TypeScript; it does not
generate either side from the other, because moving the pair in one commit is
the design and codegen is what this repo declined.

That test is there because the 422 only catches drift one way. The backend
rejects an unknown format, a tag past either limit and an invented reason — so a
frontend-only change fails loudly. A **backend**-only one does not: add a reason
here and forget `api.ts` and nothing errors, the choice is simply missing from a
menu and nobody finds out. The seven vocabularies live in `db.py` rather than
beside the routes because they define schema values and block-duration choices,
and both
`main.py` and `admin_api.py` need them without a circular import. `main.py`
imports `admin_api.py`; the shared vocabularies stay below both.

They are **not** SQL `CHECK` constraints, and that is a trade rather than an
oversight: `CREATE TABLE IF NOT EXISTS` skips a database that already exists and
SQLite cannot `ALTER` a `CHECK` in afterwards, so the rule would hold on fresh
installs and be absent on upgraded ones. One enforced rule in Pydantic beats two
different databases.

There used to be a second row here for the 20 category tags. Tags are
free-form now: the backend checks a tag's shape, never its membership, and
`/api/tags` reports the vocabulary actually in use. A format is a parser
branch and has to be agreed on; a tag never did.

Four of the five read digits. `ABBR` is the fifth and reads letters — `UFO`,
`CSI`, `NASA` — and it is a format rather than a `kind` column because
`posts.format` is already the one thing that decides how a value is read,
sorted and addressed. A second column would have been a migration, a second
hand-copied vocabulary and a branch beside every existing one.

## Design decisions that are not up for quiet revision

- **No *reader* accounts, ever.** No signup, no ownership, no per-post
  permissions, no "my posts". Anyone reads, posts and edits with no login and no
  identity beyond a nickname they type, and every guard in the public API assumes
  it — do not "fix" the open half by adding auth to it.

  There is exactly one exception and it is scoped on purpose: `admins`, the
  operators. This line used to say "no accounts, ever", and it was revised
  deliberately rather than quietly, because an operator's decision has to carry
  a name and be undoable, and neither is possible for nobody. What that buys is
  the back office — a dashboard, moderation, delete requests, reports, blocks,
  an audit log, and the one edit the open half refuses: correcting the number an
  entry is filed under — and what it must never buy is a reader account. There is no
  signup route to find. The first operator can only come from a shell
  (`admin.py add`), and every one after that from a super admin inside the
  panel. If a feature needs a reader to log in, the answer is that the feature
  is wrong for this wiki.

  **Every operator login is password plus TOTP.** Enrollment and recovery stay
  in `admin.py`, never in the public app: the shell is the existing root of
  trust, and a convenient browser recovery route would be a second door around
  the second factor. Password success creates only a five-minute challenge;
  the session cookie is issued after one unused authenticator counter succeeds.
- **Nothing removes an entry.** `posts.status` is `ACTIVE` / `HIDDEN` /
  `DELETED`, and a hidden entry drops out of all thirteen public reads and comes
  back whole. There is no `DELETE /api/posts/{id}` — the path answers 405 — and
  no delete button anywhere in the front end. An open wiki where one click can
  take a page away has no defence at all, and the fix is not confirming harder:
  it is that the click does not exist. `admin.py hide` is what moderation
  means here, and `admin.py purge` is the one hard delete, in the shell,
  for the removal a law requires. Do not add a delete route back.

  **A purge reaches the words that asked for it, too.** A removal request
  usually restates the very number, address or name it wants taken down, so
  `delete_requests.detail` and `reports.detail` go with the entry — *blanked*,
  and the rows kept, because the record that somebody asked and an operator
  agreed is exactly why those two tables carry no foreign key on `post_id`. It
  finishes the job rather than moving it: nothing else stores that text, since
  both write routes hand `reason` to the log and never the prose.
  `decision_note` is the one exception and it is an operator's discipline
  instead of a line of code — `events.meta` holds a copy of the note and that
  table cannot be touched, so redacting one of two copies would look finished
  without being finished. **The data a removal is for does not go in a
  decision note.** `test_purge_takes_the_words_that_asked_for_it` sweeps every
  column of every table for the sentences it filed.

  **The other way content disappeared was a save, and `base_updated_at` is
  what closed it.** The edit form fills itself from the entry and sends every
  field back, so a save is a read-modify-write with a person-sized gap in the
  middle: two people who open `/p/42/edit` a minute apart both hold a complete
  copy, and the second to press Publish used to write their copy of the fields
  they never touched over the first one's edit, with no error anywhere. None of
  the defences above reach that, because the loss is a *write*.
  `PATCH /api/posts/{id}` now takes the entry's `updated_at` as the sender last
  saw it and answers 409 if it has moved, which is what MediaWiki calls
  `basetimestamp`. The refusal is raised inside the transaction that took the
  snapshot, so a rejected save leaves no revision claiming somebody replaced
  the entry. `test_two_editors_do_not_undo_each_other` is the whole story.

  It is **optional**, and that is the promise rather than an omission: a write
  with no base behaves as it always did. This is an open API with no key, and
  requiring a read before a write would charge every `curl` for a problem the
  form has. Whole seconds, like every date here, so two saves inside one second
  still race — what this catches is the gap that loses work, not the one that
  needs a thread scheduler.
- **`author` is the first writer and is never overwritten.** An edit records the
  editor in `edited_by` instead. Without this, a stranger correcting a typo takes
  over the byline, which on an open wiki is most edits. `test_api_round_trip`
  asserts it.
- **A number is a column, not a table.** `/n/42` is a query on `posts.value`.
  Adding a `numbers` table would buy nothing. This is also why thousands
  separators are a display flag (`posts.grouped`) and never live in `value`:
  the moment `1,000` is storable, `/n/1000` and `/n/1%2C000` are two pages
  about one number. And it is why the value is the one field the wiki's own
  form will not let you retype — a query on a column is an address, so
  retyping it does not correct an entry, it moves the entry to a page about a
  different number and leaves the old one short a meaning. Correcting one is
  an operator's route (`POST /api/admin/posts/{id}/value`, `Change the number`
  in the panel), because there it takes a name, a snapshot and an audit row
  with it.

  **Number punctuation follows the interface locale, but number identity does
  not.** The stored spelling and every `/n/` URL remain locale-neutral — no
  grouping and a dot decimal — while the public UI renders that value with the
  selected interface locale. The write form sends `number_locale` as input
  grammar, so German `1.000,5`, French `1 000,5` and English `1,000.5` all
  become stored `1000.5`. A strict grouping pattern is required: mixed notation
  such as `1,2,3` is content and must not be silently rewritten. Server-written
  titles use the mirrored UI-locale cookie, falling back to `Accept-Language`.

  **The same UI locale owns the server-rendered metadata around the content.**
  `<html lang>`, `Content-Language`, the site and list prose in titles and
  descriptions, Open Graph locale/text and JSON-LD `WebSite`/`CollectionPage`
  language use the locale selected by `request_ui_locale()` in `seo.py`.
  `seo_locale.py` supplies the localized prose and Open Graph locale codes;
  `seo.py` writes the language attributes and headers. Entry titles, bodies
  and an Article's stored `inLanguage` remain content and are never translated
  by that choice. Every localized response varies on both the UI cookie and
  `Accept-Language`; canonical URLs remain locale-neutral.

  **The price of that is a document no shared cache can hold, and it is
  structural rather than a setting to tune.** `Vary: Cookie` keys the response
  on the whole cookie header, and every returning visitor sends a `namba_cid`
  of their own, so the cache key is one visitor wide; a first visit also
  carries `Set-Cookie`, which most caches refuse to store on its own. Taking
  the cookie off the document closes the second and not the first — the cookie
  is still *sent* — so it buys nothing, and the only thing that would is moving
  the locale out of the cookie and into the path (`/de/n/42`), which is the
  locale-neutral canonical URL above traded away. **So: if a CDN or an nginx
  `proxy_cache` is ever put in front of this, it has to bypass the document and
  cache `/assets/` alone.** The bundle is where the bytes are and it is already
  immutable — Vite hashes the names, and `ASSET_CACHE` in `main.py` says a
  year. The document is cheap to answer: `/` and `/guide` and every path that
  falls through to `noindex` run no query at all, and only `/n/`, `/a/`, `/t/`
  and `/p/{id}` read the database for their `<head>`.

  **An `ABBR` word has one stored spelling for exactly that reason.** `ufo`,
  `Ufo` and `UFO` are one word, and with no accounts there is nobody to merge
  three pages about it afterwards. The spelling is the first writer's, not
  upper-case: `SaaS` and `IoT` are abbreviations too, and `SAAS` is not how
  anyone writes them. `resolve_format` settles it, because settling the format
  is what settles the spelling — a later writer of the same word, in any case,
  adopts what is already stored, and the `/a/` reads compare `COLLATE NOCASE`
  so `/a/ufo` still lands on `UFO`. Digits have no case, which is why this
  never came up for the other four.

  **And `ABBR` is Latin script only — the one format that is checked rather
  than taken at its word.** The other four are ways of *reading* what was
  typed and cannot be wrong about it; this one is a claim *about* the value,
  and on a wiki with no login the claim is a stranger's. `is_abbr` in
  `numfmt.py` is the rule and `resolve_format` in `main.py` is where it bites,
  so both writes hit it. It is not a keyboard preference: `유에프오` and `УФО` are the
  same abbreviation in another alphabet, and one `/a/` page per alphabet is
  the split the one-spelling rule exists to prevent. An entry still says what it
  means in any language — `lang` and the translations are untouched by this;
  it is the value that is one spelling.

- **`/n/` and `/a/` are two sections over one column, and an entry has one
  address.** `/a/UFO` is the abbreviation, `/n/42` is the number, and
  `section_where()` in `main.py` is the single condition that tells them apart
  — the list endpoint, both `<head>`s and the sitemap all ask it. So a value
  filed under both, which takes somebody choosing Mixed for `UFO` on purpose,
  is two entries at two addresses rather than one entry showing up twice. Do
  not answer an abbreviation at `/n/`: it is the same mistake as storing the
  comma, one page short of the number.
- **A link in an entry stays a link.** No unfurling, no fetched thumbnails.
  Rendering a card means the server fetching a URL a stranger typed, and with
  no accounts there is nobody to rate-limit or ban — `http://169.254.169.254/`
  in a post is an SSRF with a preview attached. Adding it needs a DNS-resolved
  private-IP block that survives redirects, a size cap, a timeout and a cache,
  and that guard work is larger than the feature. Decided against, not missed.
- **The seed reports, it does not correct.** `seed.py` prints Korean titles and
  the `801.11` typo instead of translating or fixing them. Correcting source data
  is the wiki's job. Do not add cleanup passes to the importer.
- **`events` is append-only, and that costs something.** Nothing in this
  codebase issues an UPDATE or a DELETE against it, which is what makes it an
  audit log an operator cannot quietly tidy up after themselves in. The price
  is paid by `admin.py purge`: it takes the entry, its snapshots, its picture
  and the free text of any request or report about it, and leaves the entry's
  event rows holding the nickname typed, three salted hashes and whatever is in
  `meta`. So the one hard delete does not
  reach everything about a purged entry, and there is no retention sweep
  expiring the hashes either. Both were weighed and declined — a wiki this
  size gets more out of a log nobody can edit than out of a redaction. Neither
  is a bug to fix in passing: revising this means saying so here first.

  **A crash is a third kind of row in it, and that is why `anon` says so.**
  `@app.exception_handler(Exception)` in `main.py` appends an `ERROR` row when
  a request raises, because the alternative was the container's stdout and
  nothing else — `write_head`'s comment records a backslash in a title
  answering that page with a 500 until somebody happened to type one. The
  table's two halves used to be the whole story: `admin_id IS NULL` is a
  visitor's write, set is an operator's decision. An error is neither, so
  `/api/admin/activity?kind=anon` — the wiki's recent-changes feed — excludes
  it, and so does the dashboard's `writes_1h`, which otherwise counts the
  server falling over as traffic. `kind=all` is what the dashboard asks for,
  so the errors have a page without one being built for them.

  What the row carries is the exception's **type**, the route's **pattern**
  and the file and line — never the message and never the path as typed. Both
  of those can quote what a stranger wrote, and `meta` is the one place a
  purge cannot follow it. So this log answers what is breaking and where; the
  stdout traceback, which is untouched because Starlette re-raises after
  calling a handler, answers with what input.

- **One process, and that is a requirement rather than a default.** The three
  limiters that stand between an open wiki and a script — `main._writes`,
  `auth._attempts`, `auth._mfa_attempts` — are `defaultdict`s in process
  memory. A second worker is a second allowance for the same address, and a
  second container is a third: the login limiter in particular is what makes
  five password attempts a minute mean five. `--workers 1` in the Dockerfile
  is the enforcement and its comment says so, but a deploy setting is not
  where a rule like this survives — this list is. So it is here: **adding
  workers, gunicorn, or a second replica means moving those three out of
  process memory first**, in the same change, or the rule is quietly gone with
  nothing failing. There is no test that can catch it, which is the other
  reason it is written down.

- **Everything readers write is CC0.** Public domain, stated where it is given
  away — a line at the form's Publish button, not only in the footer, because a
  waiver read after the fact is not one. The byline still stands: `author` is a
  record of who got there first, not a right retained.
## Working here

Prefer editing what exists over adding files — this is deliberately a small
codebase (~17,000 lines, tests and CSS included). Each app has its own
`CLAUDE.md` with the details that bite.

**Commit in logical units, without being asked.** One coherent change per
commit — the feature, then the doc note, not both in a heap at the end of a
session. Run the checks above before each one. Pushing is a separate decision:
`origin` is `github.com/Dodant/Namba`, and whether a commit goes there is the
user's call, not a default — commit freely, push when asked.

Messages follow [Conventional Commits](https://www.conventionalcommits.org):
`type(scope): subject` — imperative, lowercase after the colon, no trailing
period. Types: `feat` `fix` `docs` `style` `refactor` `test` `chore`. Scope is what
changed (`backend`, `frontend`, `index`, `seed`, `api`) and is dropped when the
change spans both apps. The body explains why, not what — the diff has the what.
