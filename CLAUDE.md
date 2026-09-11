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
| the 6 formats | `numfmt.py` `FORMATS` | `src/api.ts` `FORMATS` |
| the two tag limits | `main.py` `TAG_MAX`, `TAGS_PER_POST` | `src/api.ts`, same names |
| the moderation vocabularies | `db.py` `DELETE_REASONS`, `REPORT_REASONS`, `POST_STATUSES`, `REQUEST_STATUSES`, `REPORT_STATUSES`, `BLOCK_TYPES`, `BLOCK_HOURS` | `src/api.ts`, same names |
| the index's bands | `numfmt.py` `bucket_of` — computed, not listed | `src/api.ts` `BUCKETS`, `ABBR_BUCKETS`, `MONTH_BUCKETS` |
| which format is which section | `store.py` `SECTION_FORMATS` | `src/api.ts` `OF_FORMAT` — the same map read the other way |
| what a calendar date is | `numfmt.py` `_DATE`, `_MONTH_DAYS` | `src/format.ts` `DATE`, `MONTH_DAYS` |

`test_the_two_apps_still_agree` in `test_namba.py` reads `src/api.ts` and
`src/format.ts` and checks every row of that table, so "change one, change the
other" is a thing the suite notices rather than a thing you remember.

The last two rows joined the table after each had already drifted once. The
section map is what the edit form asks which format to disable and which to
drop from the menu, so a format that only the backend knows is in a section
leaves the form offering a move `edit_post` answers 422 to — no error until
somebody presses Save. And the date pair is the one place the two languages
disagree about a character class: Python's `\d` matches every Unicode decimal
numeral and JavaScript's is ASCII whatever the flags, so a backend `\d` gave
`١٢-٢٥` and `１２-２５` a `/c/` address each and one day three pages. `[0-9]`
is the spelling that means the same thing on both sides, and the test compares
the patterns as text with that substitution made.

The bands row is the odd one and worth reading twice. The vocabulary rows are lists
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

Tags are not a row in this table. They are free-form: the backend checks a
tag's shape, never its membership, and `/api/tags` reports the vocabulary in
use. A format is a parser branch and has to be agreed on; a tag is not
(ADR-0010).

Four of the six read digits as a number. `ABBR` reads letters — `UFO`, `CSI`,
`NASA` — and `CALENDAR` reads a day of the year, and both are formats rather
than a `kind` column because `posts.format` is already the one thing that
decides how a value is read, sorted and addressed. A second column would have
been a migration, a second hand-copied vocabulary and a branch beside every
existing one (ADR-0026).

Five of the six are **checked** rather than believed, and on a wiki with no
login the claim being checked is always a stranger's. `ABBR` and `CALENDAR`
are claims about what the value *is* — that it is a word, that it is a date —
and `is_abbr` and `date_key` in `numfmt.py` are the rules. `INTEGER` and
`DECIMAL` are the claim that it *reads* as a number, and the check is that
`float()` gets a finite one out of it.

`TIME` is the one taken at its word: an explicit `TIME` on `1:29:300` files
with no sort key, and nothing downstream bands or serializes on it. `MIXED`
claims nothing at all, being the remainder. `resolve_format` in `store.py` is
where all five bite, so all three writes hit them.

The two number checks are not tidiness. A `sort_key` is load-bearing twice:
without one an `INTEGER` entry matches no band on the index and is drawn
nowhere — on the wiki and on no page, the thing the band rule above exists to
prevent — and a non-finite one cannot be serialized at all, because SQLite
keeps `NaN` as `NULL` (the first case again) and keeps `Inf` as `Inf`, which
`json.dumps` refuses. One `{"value": "inf", "format": "INTEGER"}` used to be
enough to 500 `/api/numbers` and `/api/posts` for every reader until an
operator found the row.

What the check does **not** do is decide how a number is spelled. `float()`
reads `-42`, `1e5`, `1_000` and `٤٢`, and all four stay as typed: two
spellings of a number are two entries sharing a sort key, which is the rule
for the four that read digits (ADR-0005). Only `CALENDAR` promised the
opposite, and only its regex says `[0-9]`.

## Design decisions that are not up for quiet revision

- **No *reader* accounts, ever.** No signup, no ownership, no per-post
  permissions, no "my posts". Anyone reads, posts and edits with no login and no
  identity beyond a nickname they type, and every guard in the public API assumes
  it — do not "fix" the open half by adding auth to it.

  There is exactly one exception and it is scoped on purpose: `admins`, the
  operators, because an operator's decision has to carry a name and be undoable,
  and neither is possible for nobody (ADR-0001). What that buys is
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
  `DELETED`, and a hidden entry drops out of all fourteen public reads and comes
  back whole. There is no `DELETE /api/posts/{id}` — the path answers 405 — and
  no delete button anywhere in the front end. An open wiki where one click can
  take a page away has no defence at all, and the fix is not confirming harder:
  it is that the click does not exist. Hiding is what moderation means here,
  and `admin.py purge` is the one hard delete, in the shell, for the removal a
  law requires. Do not add a delete route (ADR-0002).

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

  **A save carries the entry as the sender last saw it, and a save built on a
  stale copy is refused.** The edit form fills itself from the entry and sends
  every field back, so a save is a read-modify-write with a person-sized gap in
  the middle: two people who open `/p/42/edit` a minute apart both hold a
  complete copy, and without a check the second to press Publish writes their
  copy of the fields they never touched over the first one's edit, with no
  error anywhere. None of the defences above reach that, because the loss is a
  *write*. `PATCH /api/posts/{id}` takes `base_updated_at` and answers 409 if
  the entry has moved since, which is what MediaWiki calls `basetimestamp`. The
  refusal is raised inside the transaction that took the snapshot, so a
  rejected save leaves no revision claiming somebody replaced the entry.
  `test_two_editors_do_not_undo_each_other` holds it (ADR-0006).

  **One path puts an entry back from nothing.** `restore_revision` has a
  branch for a snapshot whose entry row is gone, a state nothing in this
  codebase can produce. Production holds no such row, and carries no trace
  that the route which could make one ever ran there — measured against the
  file on 2026-09-10 and written up in ADR-0002 — so the branch,
  `guard_public`'s absent-passes rule and `PostPage`'s recovery view answer
  for nothing that exists and may go whenever somebody decides to take them.
  What comes back is
  the entry, its tags and its translations. Comments and links cannot: neither
  is in a snapshot, and both cascade on `posts(id)`.

  The base is **optional**, and that is the promise rather than an omission: a
  write with no base is accepted as it stands. This is an open API with no key, and
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

  **Nothing is taken from a value unless something keeps it.** A grouping
  separator comes out because `posts.grouped` puts it back; a second writer's
  `ufo` becomes `UFO` because the first writer's spelling is what is stored;
  text is folded to NFC because the two spellings are the same characters.
  Everything else is stored as typed, so `007` and `7`, `09:41` and `9:41`,
  `10:04PM` and `10:04pm`, `3.10` and `3.1` are each two entries at two
  addresses — the wiki does not decide how somebody writes the number they
  are writing about. They share a sort key, which is what puts them beside
  each other on the index rather than on top of each other (ADR-0005).

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
  locale-neutral canonical URL above traded away, or out of the server's
  decision altogether (ADR-0011). **So: if a CDN or an nginx
  `proxy_cache` is ever put in front of this, it has to bypass the document and
  cache `/assets/` alone.** The bundle is where the bytes are and it is already
  immutable — Vite hashes the names, and `ASSET_CACHE` in `main.py` says a
  year. The document is cheap to answer: `/` and `/guide` and every path that
  falls through to `noindex` run no query at all, and only `/n/`, `/a/`,
  `/c/`, `/t/` and `/p/{id}` read the database for their `<head>`.

  **An `ABBR` word is one page, and its case is not a spelling to be fixed.**
  `ufo`, `Ufo` and `UFO` are one word and with no accounts there is nobody to
  merge three pages about it afterwards — so the *reads* fold case and nothing
  rewrites what was typed. Three things hold it, none of them a rewrite: the
  `/a/` reads compare `COLLATE NOCASE`, `head_abbr` canonicalises the page to
  the earliest entry's spelling, and the sitemap groups the same way so its
  `<loc>` and that canonical agree. `resolve_format` is therefore pure — it
  checks `is_abbr` and hands the value back as typed.

  Case is part of an abbreviation and not a way of typing one, which is why
  the reads fold it and the column does not. `dB` is not `DB`, `kB` is not
  `KB`, `mAh` is not `MAH`: a decibel and a database are two words that share
  three letters, and `SaaS` and `IoT` are the same argument from the other
  side. There is nobody here to ask which was meant. **Do not give
  `resolve_format` a sibling lookup that rewrites the value** — folding the
  column hands the word to whoever wrote first *and puts the correction out of
  reach*, because the operator's renumber settles its value through the same
  function: the retyped `dB` comes back `DB`, and the "nothing changed" guard
  then answers 409. That leaves the one route that exists to correct a value
  unable to correct this one, and it takes the create route's race with it
  (ADR-0005, ADR-0007). Digits have no case, which is why none of this reaches
  the other four.

  **And `ABBR` is Latin script only — one of the five formats that are checked
  rather than taken at their word.** `INTEGER` and `DECIMAL` are checked for
  being readable as a number; this one is a claim about what the value *is*,
  and on a wiki with no login the claim is a stranger's. `is_abbr` in
  `numfmt.py` is the rule and `resolve_format` in `store.py` is where it bites,
  so both writes hit it. It is not a keyboard preference: `유에프오` and `УФО` are the
  same abbreviation in another alphabet, and one `/a/` page per alphabet is
  the split the one-page rule exists to prevent — and case-folded reads cannot
  reach across alphabets the way they reach across `dB` and `DB`. An entry still says what it
  means in any language — `lang` and the translations are untouched by this;
  it is the value that is one spelling.

- **A fixed calendar date is a day of the year and nothing else.** `CALENDAR`
  is Christmas and April Fools — a zero-padded `MM-DD` at `/c/12-25`, sorted
  by `month * 100 + day` the way a `TIME` is sorted by minutes past midnight,
  and banded by month so the index reads as a calendar. There is no year in
  it: a date that happens once is a number like any other and belongs at
  `/n/`.

  **Its other spellings are refused, not folded.** `1-5` does not become
  `01-05`. Nothing would keep that difference, and one day has to have one
  address, so refusal is what is left once rewriting is off the table — which
  is the rule above reached from the other side, and the reason `date_key`
  both checks the value and hands back the sort key. `02-30` and `13-01` go
  the same way; `02-29` does not, because a leap day is a fixed date and there
  is no year here to disagree with it. **`parse_number` does not guess at
  it** either: `12-25` is Christmas and `80-20` is a ratio, and nothing in
  either string says which, so this format is reached by picking it, the way
  `TIME` is on `1:29:300` (ADR-0026).

  **`/c/` is the one section that is a closed set, so an unreadable date is
  not a page.** There are 366 days: `/c/99-99` is not an empty date page the
  way `/n/999999` is an empty number one, where nobody has written about that
  number *yet*. `index_html` in `seo.py` and `CalendarPage` in `App.tsx` each
  ask `date_key` / `monthDay` before drawing one, so what a crawler reads and
  what a reader sees agree: the noindex head every mistyped path gets, and the
  `*` route's own "Nothing here". `index_html` asks for the stored spelling
  exactly, because `date_key` strips — on a write it reads a value somebody
  typed, while a path segment *is* the address — and `/c/%2012-25` taking a
  date page's head and a canonical pointing at itself is one day with two
  addresses, by a space. Left open, the empty page's "Give it a
  meaning" link carried the unreadable value to the form, which cannot read it
  back and starts from today — so the reader who asked for `99-99` filed an
  entry under this morning. A valid date with no entries is untouched;
  `/c/01-02` is still a page somebody can be the first to write on.

- **`/n/`, `/a/` and `/c/` are three sections over one column, and an entry
  has one address.** `/a/UFO` is the abbreviation, `/c/12-25` is the date,
  `/n/42` is the number, and `SECTION_FORMATS` in `store.py` is the single
  map that tells them apart — the list endpoint and all three value `<head>`s
  ask it through `section_where()`, and the sitemap through `section_sql()`,
  which needs the section as a value to group by rather than as a filter. So a
  value filed in two of them, which
  takes somebody choosing Mixed for `UFO` or for `12-25` on purpose, is two
  entries at two addresses rather than one entry showing up twice. Do not
  answer an abbreviation or a date at `/n/`: it is the same mistake as storing
  the comma, one page short of the number.

  `number` is the **remainder** of the three rather than a listed arm, so a
  seventh format arriving with no thought about sections lands at `/n/`, which
  is the side where a value with nothing special about how it reads has always
  answered. `section_of()` and `section_sql()` beside it are the same three
  names read the other way — a path to build, a column to group by — because a
  second answer to which section a row is in would be two addresses for one
  entry.

  **The open form does not move an entry between sections**, for the same
  reason it will not let the value be retyped: a section is an address, and a
  page that moves leaves every link to it one page short of the thing it was
  about. An abbreviation stays an abbreviation, a date stays a date, and a
  number does not become either — `edit_post` refuses it, reading the format
  it has *settled* rather than the one that was sent, so an edit carrying only
  a value is the same refusal and not the way round it. Correcting one that is
  filed wrong is `POST /api/admin/posts/{id}/value`, the same operator's route
  that corrects a value, with a name, a snapshot and an audit row behind it.

  The address is all this rule keeps. A sort key is kept a step above it, by
  `INTEGER` and `DECIMAL` being checked rather than believed, so a re-filed
  `UFO` or `12-25` is refused there and never reaches this check at all. The
  two are independent and both are wanted: one keeps an entry where its links
  point, the other keeps a number a number.

  A **restore is held to the same rule**, because `apply_snapshot` writes the
  format straight out of the snapshot and the open half would otherwise have
  a second way in: putting an entry back at `/n/` that answers at `/c/`, and
  undoing an operator's renumber — a name, a snapshot and an audit row — with
  one unauthenticated POST carrying none of the three. `restore_revision`
  refuses a cross-section restore; the operator's own restore is the other
  caller of `apply_snapshot` and does not come through it, so it still
  crosses. A restore puts an entry's *words* back, never its address.

  There is **one** move still allowed, and it is into `/c/`: `parse_number`
  will never hand a date back — `12-25` is as much a ratio as a day — so
  picking Calendar is all an entry written before somebody noticed it was a
  date has. It takes the format and **not the value** with it: an entry
  somebody noticed was a date already reads as one, while the same request
  carrying a value is not a re-filing, it is `42`'s page becoming
  Christmas's — and the refusal above then holds it there, since every later
  edit re-derives a number and reads as a move back out. `ABBR` needs no such
  door, because the parser already guesses
  `UFO`. The front end keeps the same shape: on an edit the Format select is
  `disabled` for an entry already at `/a/` or `/c/`, and Abbreviation is off
  the menu for one at `/n/`.
- **A link in an entry stays a link.** No unfurling, no fetched thumbnails.
  Rendering a card means the server fetching a URL a stranger typed, and with
  no accounts there is nobody to rate-limit or ban — `http://169.254.169.254/`
  in a post is an SSRF with a preview attached. Adding it needs a DNS-resolved
  private-IP block that survives redirects, a size cap, a timeout and a cache,
  and that guard work is larger than the feature. Decided against, not missed
  (ADR-0012). The reader's side of the same argument is that an entry's
  `image` is one of this wiki's uploads and never an outside URL (ADR-0019).
- **The seed reports, it does not correct.** `seed.py` prints Korean titles and
  the `801.11` typo instead of translating or fixing them. Correcting source data
  is the wiki's job. Do not add cleanup passes to the importer (ADR-0013).
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
  a request raises, so a route that fails only on some input is found in the
  log an operator already reads rather than by the reader who happens to type
  that input (ADR-0004). The table's other two kinds are `admin_id IS NULL`, a
  visitor's write, and set, an operator's decision. An error is neither, so
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

- **Reading records nothing, and the one exception volunteered.** The editor
  plugin — its own repository, `Dodant/Namba-plugin` — names itself in a
  `User-Agent`, and `/api/posts` counts that read in `plugin_days`: one row
  per client per day, a counter that UPDATEs. Every other read still records
  nothing, which is very nearly every read, and the self-declaration is the
  whole of the boundary — what gets counted is the traffic that asked to be,
  which is why this is not analytics arriving by the side door. It is
  deliberately **not** an `events` row: `/loop 30m` is 48 calls a day per
  install, and as event rows they would bury the recent-changes feed and sit
  at the top of the abuse page, where an install asking politely every half
  hour looks exactly like somebody hammering the wiki. **No figure on that
  page is an install count** — an install is a git clone, nothing calls home,
  and a client is an address hash rather than a person, so an office is one
  and a laptop on two networks is two. The half of this that lives in the
  other repository, `-A namba-plugin` in its `SKILL.md`, is hand-copied
  against `PLUGIN_UA` here and no test in this suite can reach it: change one
  and the figures go quietly to zero, with no error anywhere (ADR-0028).

- **A write that decides holds the lock while it decides.** `db.writing(con)`
  is the transaction every one of the twelve public write routes opens, and it
  is `BEGIN IMMEDIATE` rather than `with con:` for a reason that is easy to get
  wrong: Python's sqlite3 in legacy isolation mode begins its transaction
  before the first *write*, so a SELECT earlier in the block holds nothing at
  all. In WAL that never fails — it answers about the database as it stood,
  while another writer commits over it, and the route then decides on what it
  read. Two concurrent translations into one language are the case that shows
  it: read outside the lock, both see no Korean tab, both write, and the entry
  has two (ADR-0007 has the measurement).

  Eleven of the twelve decide, and the twelfth is why `resolve_format` being
  pure is written down here. A create reads nothing it acts on: several
  entries under one value is normal, and there is no uniqueness to race for.
  It still opens `db.writing`, because three statements have to land together
  — but the lock is for the writes, not for a read, and
  `test_every_write_decides_inside_the_lock` probes the other eleven rather
  than claiming this one keeps a rule it has nothing to keep. Giving
  `resolve_format` a lookup again puts the race back.

  **Moving the read inside without the `IMMEDIATE` is worse than leaving it
  out**, which is why they are one change. A deferred transaction that reads
  and then writes must upgrade its lock, two of them together is a deadlock
  SQLite cannot wait out, and `busy_timeout` does not apply to an upgrade — so
  the quiet race becomes a 500 saying "database is locked". `test_every_write_
  decides_inside_the_lock` asserts the rule from outside: at each route's
  deciding read a second connection tries to take the write lock and has to be
  refused. `con.in_transaction` cannot stand in for that, because it is true of
  the deferred transaction that holds nothing.

  A write that only *appends* does not need it — `/api/upload` records an event
  and decides nothing, and `with con:` is the right amount of ceremony for one
  INSERT. The rule is about deciding, not about writing.

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
  reason it is written down (ADR-0008).

- **Everything readers write is CC0.** Public domain, stated where it is given
  away — a line at the form's Publish button, not only in the footer, because a
  waiver read after the fact is not one. The byline still stands: `author` is a
  record of who got there first, not a right retained. The code is MIT
  (`LICENSE`); the two are different things given away by different people
  (ADR-0021).
- **The public API is readable from any origin and writable from its own
  pages.** CORS grants only reads, and every write refuses
  `Sec-Fetch-Site: cross-site`; a client that is not a browser sends neither
  and is unaffected. The guards on the open half all count per address, and a
  page elsewhere writing here through its visitors' browsers would hold every
  one of theirs (ADR-0018).
- **Text is stored in one Unicode normal form.** Every string a write takes
  and every parameter a read filters on is folded to NFC by `db.nfc()`, so
  composed and decomposed Korean are one tag, one language and one search hit
  (ADR-0020).
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

## Writing these notes

The three `CLAUDE.md` files and `README.md` say what holds today, in the
present tense: the rule, the reason it holds, and the test that notices. How a
rule came to be — what it replaced, what was tried, what was measured, and
when — goes in `docs/adr/`, one numbered record per decision, and the note
points at it (`ADR-0002`). So a note never has to say "used to": when a rule
changes, the record gets a new entry under *History* and the note is rewritten
as if the rule had always been so. Dates, line counts and commit hashes belong
in a record, not in a note or a code comment — a comment that quotes a
measurement is wrong the next time the code moves, and a record is where a
measurement can stay true, because it says when it was taken. Every decision
under *not up for quiet revision* above has a record, and a new one gets its
record in the same commit as its bullet.
