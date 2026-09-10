# Namba

An open wiki of numbers. Every number means something to someone — 42 is a book,
1885 is a film, 09:41 is a keynote — and this is where people write those meanings
down. No account, no login: anyone can read, post and edit.

Nobody can delete. There is a back office at `/admin` where whoever runs the wiki
decides that instead, and it is the only login in the place.

Seeded from the tracked `Memorable Numbers.md` source (183 entries).

## Running it

Two terminals.

```sh
# api  → http://127.0.0.1:8000
cd Namba-backend
uv venv --python 3.11 .venv          # first time only
uv pip install -r requirements.txt --python .venv/bin/python
.venv/bin/python seed.py --reset     # first time only
.venv/bin/uvicorn main:app --reload

# web  → http://localhost:5173  (proxies /api, /uploads, /docs and /openapi.json to the api)
#        the wiki is at /, the back office at /admin
cd Namba-frontend
npm install
npm run dev
```

There is no signup, so the first operator comes from a shell:

```sh
cd Namba-backend
.venv/bin/python admin.py add you@example.com  # prompts twice; the first is a super admin
.venv/bin/python admin.py totp-enroll you@example.com  # add the key to Google Authenticator
.venv/bin/python admin.py admins               # who can sign in
```

An operator cannot sign in with a password alone. `totp-enroll` needs an
interactive terminal, prints a manual setup key, and commits the enrollment only
after a current six-digit code proves the authenticator received it. Running the
same command again replaces a lost phone's key and revokes every live session.
There is deliberately no browser recovery route.

On the production host, including once immediately after the release that first
adds TOTP, enroll the existing operator inside the container:

```sh
cd /home/ubuntu/chiral-root
docker compose exec namba python admin.py totp-enroll you@example.com
```

The password command wants a real terminal, because it hides the typing. Somewhere without one —
`docker exec`, a deploy script — pipe it instead, knowing that a pipe puts the
password wherever your shell keeps its history:

```sh
printf '%s\n' 'the password' | .venv/bin/python admin.py add you@example.com
```

It is never read from the command line, in either case.

Self-check: `cd Namba-backend && .venv/bin/python test_namba.py`

The endpoints are not listed anywhere in this file on purpose —
<http://127.0.0.1:8000/docs> is FastAPI reading them off the code, so it cannot
go stale the way a table here would.

## How it fits together

`Namba-backend` — FastAPI over stdlib `sqlite3`, no ORM. Fifteen Python files,
including the test suite:

| file | what it holds |
|---|---|
| `main.py` | every route, the Pydantic models, the upload and rate limits |
| `db.py` | connection, schema, and where the database and uploads live |
| `seo.py` | the `<head>` written for a crawler, and the locale it is written in |
| `store.py` | reading and writing one entry — the pieces both APIs need |
| `numfmt.py` | `parse_number()` — a display string to a format and a sort key |
| `seo_locale.py` | localized metadata prose and Open Graph locale codes |
| `test_namba.py` | the backend and cross-app checks |
| `seed.py` + `seed_tags.py` | the markdown importer and its hand-written tags |
| `admin_api.py` | the back office's routes, under `/api/admin` |
| `auth.py` | operator passwords and sessions — the only login here |
| `events.py` | who a request is from, as hashes, and the log of what they did |
| `gc_uploads.py` | the cron job that deletes pictures nothing points at |
| `admin.py` | the operator's commands — accounts, TOTP enrollment, `hide`, `show`, `purge` |

`Namba-frontend` — React + Vite, no state library and no UI kit. `src/api.ts` is
the whole client; `Browse.tsx` serves the number (`/n/`), abbreviation (`/a/`),
tag and search pages because they differ only by which filter they pass. The home page has two views off a
`?view=` param — the number index, and a feed of what was last written or
rewritten.

Nothing on a read page rewrites the entry. The one control that does is `Edit`,
quiet at the end of the meta row on `/p/:id`; everything that changes the entry
— languages, history, links — is in the form behind it. What a read page does
carry is the three things written *beside* an entry rather than to it: a like, a
comment, and the "Flag a problem" fold. Nothing there deletes either: an entry
can be hidden by whoever runs the wiki and is never removed by a visitor.

### Numbers

A number is a column on a post, not a table — `/n/42` is a query. Each carries a
**format** and a **sort key**:

| format | example | sort key | read at |
|---|---|---|---|
| `INTEGER` | `42`, `299792458` | the value | `/n/42` |
| `DECIMAL` | `3.14`, `42.195` | the value | `/n/3.14` |
| `TIME` | `10:04PM`, `09:41` | minutes past midnight | `/n/09:41` |
| `MIXED` | `11/22/63`, `80/20`, `9¾` | none — sorts by string | `/n/80%2F20` |
| `ABBR` | `UFO`, `CSI`, `R&D` | none — sorts by string | `/a/UFO` |

A number can also be written with thousands separators. `1000` and `1,000` are
the same number and answer at the same `/n/1000`, so no separator is ever
stored — a checkbox on the form records that you want them, and they are put
back when the number is drawn. Typing them counts as asking: `1,000` files
itself under `1000` with the box already ticked. An index row carries several
entries, so it only groups when all of them asked to; a single entry on its own
gets what it asked for.

`parse_number()` guesses, and the poster can overrule it in the form. It has to
work that way: `11:11` is a clock, `1:29:300` is Heinrich's law, and nothing in
the string says which.

Integers get a magnitude band (`1`, `10`, `100`, `1000`, `10000+`) and
abbreviations a letter band (A to W, then `X-Z`, then `0-9` last for `MP3`); a
TIME gets none, because banding 09:41 by its sort key would file it under "100".

**Abbreviations** are the fifth format and the one that is not digits — `UFO`,
`CSI`, `NASA`. Everything else about them is a number's: one entry per meaning,
anyone can edit, nothing removes one, all of it CC0. Three things are their own.
They are read at `/a/UFO` rather than `/n/UFO`, so a value somebody files under
both sections is two entries at two addresses instead of one showing up twice.
A word has one stored spelling — the first writer's, so `SaaS` stays `SaaS` —
and `ufo` typed later lands on `UFO`, because they are one word and with no
accounts there is nobody to merge two pages about it afterwards — the same
argument the thousands separator makes one paragraph up. And the value is
Latin letters: `R&D`, `Ph.D`, `I/O`, `TL;DR` and `MP3` are fine, `유에프오` and `УФО` are
the same abbreviation in another alphabet and would be a second page about one
word.

That is the only place on this wiki with an alphabet rule, and it is about the
*value*, which is the address. What an entry says is as free as anywhere else —
`/a/UFO` can be titled and written in Korean, and translated into other
languages; the form offers 18 language choices.

### Anyone can edit

There are no accounts, so there is no owner to check — every entry is open to
every visitor, and the post list offers an `edit` link on each card.

Two things keep that from being destructive. First, `author` records whoever
wrote an entry and is **never** overwritten; an editor is recorded separately in
`edited_by`, so a stranger's correction reads "written by seed, last edited by
arthur" rather than quietly stealing the byline. Second, every edit and every
restore snapshots the previous state into `revisions` first. That history reads
down the right-hand column of each entry and is restorable from the entry's edit
form; the fifty newest are shown, since a snapshot is the whole entry and an
entry that has been fought over carries hundreds. Those rows deliberately have
no foreign key — they outlive the post they describe, which is also what lets an
entry whose row is gone come back at its own address (ADR-0002 in `docs/adr/`
says where such rows come from).

Third, nothing takes an entry away. `posts.status` is `ACTIVE`, `HIDDEN` or
`DELETED`; there is no delete route and no delete button, and a hidden entry
leaves every public read and comes back whole. Whoever runs the wiki hides one
with `python admin.py hide <id>`.

An entry's details are markdown — bold, italics, links, lists, headings, quotes,
code and tables — rendered on the entry page. Lists show it read back as plain
prose instead, clamped to three lines, since a preview with `**` in it is not a
preview. Raw HTML in a post is escaped rather than rendered: anyone can write
here, so nothing anyone writes becomes markup.

People can also talk about an entry without touching it. Comments sit in the
rail under the edit history, open by default, five of them and then a fold —
plain text, not markdown, 300 characters, with the same typed nickname as
everything else. A remark deliberately does not bump the entry up the Recent
feed, because it is not a rewrite. There is no edit and no delete on one: with
no accounts a Remove button belongs to nobody, and unlike an entry a comment has
no revision behind it, so the button would be the loss rather than the guard
against it. They hide with the entry and come back with it, and a purge takes
them along.

Writes are rate limited to 20/minute per IP, in memory — likes included, since
they are writes too. Uploads are capped at
5 MB each and 1 GB in total by default (`NAMBA_UPLOAD_TOTAL_MB=1024` sets
the directory cap in MiB), restricted to jpg/png/gif/webp, and always renamed
to a server-generated UUID. A picture is uploaded the moment it is picked, before
the entry is saved, so a closed form leaves one behind; `gc_uploads.py` collects
those, and treats a name in a body or in a revision snapshot as a reference,
since a restore hands an old path back.

### Other languages

An entry can carry the same content in as many languages as people care to add;
a tab strip above the title switches between them, with the entry as written
sitting under "Original". There is one row per language per entry, so writing
the same language twice edits it instead of duplicating it.

The label is free-form to the API — any 40-character string — but the form does
not let you type one. Both language fields are menus over a list of endonyms in
`api.ts` (`LANG_CODE`), because free text turns one language into "Korean",
"한국어" and "korean", which reads as three tabs and filters as three. Nobody is coining a
language, so a fixed menu is not a claim about what people may mean, the way a
fixed tag list would be.

The entry says what it is itself written in, in the form's "Written in" field,
and then the tab reads "Original (한국어)" rather than leaving the reader to work
it out from the title. The menu has no empty choice: a new entry starts on
English and an entry with nothing recorded picks it up the next time it is
saved. It defaulted to "Not set" once, and the result was most entries
recording no language at all. The column is still nullable and everything
written before the field existed is still `NULL` until somebody saves it —
nothing backfills on an entry's behalf.

A picker in the footer sets the preferred language for entry text — the
index, the feed, a number, an abbreviation, a tag, a search and an entry page.
An entry that has been written in that language shows that version; an entry that has not keeps its own title and
body, so a wiki nobody has finished translating still reads as a wiki rather
than as a page of gaps. The options come from the translations that exist, not
a fixed list. `contentLanguage` in `api.ts` saves it as `namba.contentLang` in
`localStorage`, with `namba.lang` as a legacy fallback. The default is the empty
string, shown as "As written". Entry pages start with that preference and also
let the reader switch translations with their own tab strip.

The footer picker is always visible, including before the first translation.
`/api/languages` supplies the translated-language options; a saved choice missing
from that response remains selectable with a count of zero. The interface
language is a separate footer setting.

Translations follow the same rules as everything else: anyone can add, rewrite
or remove one, the first translator keeps the byline, and the change is
snapshotted into the entry's history first, so a removed translation is one
Restore away.

### Tags

Free-form, two per post — a film of a book gets both, and that is about as
wide as an entry honestly is. The seed arrives
with twenty — `MOVIE TV ANIME BOOK MUSIC GAME BRAND SPORTS SCIENCE MATH TECH
HISTORY RELIGION MEME PERSON PLACE MYTH SLANG RULE UNIT` — and anyone can coin
another by typing it. The form suggests the tags already in use, most-used
first, because a fixed list is a claim about what people are allowed to mean.

What is checked is shape, not membership: lower-cased and whitespace-collapsed
so `Book` and `book` are one tag, at most 24 characters, and no slash — a tag
is a path segment in `/t/:tag` and the one in `HIP/HOP` would read as two.

Lower-case all the way through, including on screen. The form folds what you
type as you type it, so the tag you see in the field is the tag that gets
made, and `/t/BOOK` still resolves — the filter folds case on the way in, so
links written before the rule changed keep working.

### Nobody deletes

A wiki anyone can edit is also a wiki anyone could empty, and the fix is not a
confirmation dialog — it is that the button does not exist. There is no
`DELETE /api/posts/{id}` (the path answers 405) and no delete control anywhere in
the front end. `posts.status` is `ACTIVE`, `HIDDEN` or `DELETED`, and a hidden
entry drops out of all thirteen public reads and comes back whole: its history, its
comments, its translations, at the same address.

So a reader who thinks an entry should go asks, in the "Flag a problem" fold
beside the entry, and an operator decides. Reports live in the same place and are
the other half of it: *something is wrong here*, as against *this should not be
here*.

The one hard delete is `python admin.py purge <id> --yes`, in a shell, for the
removal a law requires. It has to be its own thing because on this wiki an *edit*
cannot remove anything — `snapshot()` copies the old body into `revisions` and
that endpoint is public, so blanking a phone number by editing moves it one click
away rather than removing it. A purge takes the entry, its snapshots and its
picture together.

### The back office

`/admin`, behind a login, and a second document rather than a route in the wiki's
bundle — the reading pages should not carry a table UI nobody but an operator
opens, and roughly 1,600 lines of the wiki's global CSS should not reach a dense
table.

| | |
|---|---|
| Dashboard | where the wiki is, what happened today, what is waiting |
| All content | every entry including the hidden ones — the one list that does not filter on status |
| One entry | the body as source, every revision, a diff between any two, hide / remove / revert |
| Recent changes | every write a visitor made |
| Delete requests | the queue; approve or reject, with the reason kept |
| Reports | grouped per entry, with each reporter's hashes |
| Spam & abuse | writes per client per window, and the same paragraph filed under several numbers |
| Blocked clients | by address or by cookie, with an expiry; lifted ones stay listed |
| Audit log | every decision an operator made, and nothing can edit it |
| Operators | the accounts, addable by a super admin |

Two things it deliberately does not do. It has no editor of its own — "Edit on
the wiki" opens the wiki's own form, because there is one place that knows how a
number value is parsed and a second answer to that is a bug waiting. And
resolving a report does nothing to the entry: hiding it, reverting it and
blocking whoever wrote it are separate buttons with separate audit rows, rather
than one button that does four things and logs one.

No address is stored anywhere. Every IP, user agent and client cookie is a
sha256 salted with the install's own key. Tables show only the first four
characters; a block confirmation and its audit-log metadata show eight so an
operator can distinguish the exact target of an irreversible decision.

## Deploying

One process. `npm run build` writes `Namba-frontend/dist/`, and the API serves
it: built assets by path, `index.html` for everything else, so `/n/42` survives
a refresh without a rewrite rule. A SQLite file sits next to it, in WAL mode so
that saving an entry does not lock out everyone reading one, and any box with a
real disk will do — a filesystem without shared-memory locks (NFS, SMB) will
not.

They are served together rather than split so that every page can carry its own
`<head>`. A share of an entry has to arrive with that entry's title, blurb and
picture already in the markup — no crawler runs the JavaScript that would set
them — so something has to write the `<head>` per request, and the only process
holding the entry is this one. `/` gets `WebSite` JSON-LD with a
`SearchAction`; `/n/42`, `/a/UFO` and `/t/book` get descriptions and JSON-LD
`ItemList`s naming their entries. `/guide` gets its own title, description and
breadcrumbs.
`/search`, `/new`, `/random`, an edit form and anything mistyped are marked
`noindex`. `NAMBA_DIST` overrides where it looks.

`/robots.txt` and `/sitemap.xml` come from the same process and name the address
the request arrived at, so there is no domain configured anywhere in this repo.
Uvicorn enables proxy headers by default; set `FORWARDED_ALLOW_IPS` to the
trusted proxy addresses so its forwarded scheme and client address are used.
If the proxy does not pass `X-Forwarded-Proto`, set
`NAMBA_BASE_URL=https://your.host` for correct canonical URLs.

The sitemap is how the wiki is found at all: every link to `/n/42` is drawn by
the router after the JavaScript runs, and most crawlers — every AI one — do not
run it. `robots.txt` allows those crawlers deliberately, because everything here
is CC0 and the footer already says so.

In development nothing of that runs: `npm run dev` serves the app and proxies
`/api`, `/uploads`, `/docs` and `/openapi.json` here, which is why the injection
is covered by `test_share_card` rather than by looking at it.

One caveat: the rate limiter lives in process memory, so it is per-worker. Run
one worker, or move it to redis. It counts per IP, so a reverse proxy needs
`FORWARDED_ALLOW_IPS` set, or every request arrives from the proxy and the whole
site shares one allowance.

Two things want a cron entry, and on the deployed host both already have one.

`python gc_uploads.py --delete` daily, or abandoned uploads accumulate until
the 1 GB ceiling stops the wiki taking pictures.

And a backup, which is **not a script in this repository**: it lives beside the
one for the other stack that shares the box, at
`chiral-root/scripts/namba-backup.sh`. Three things go up daily, by three
methods, because they change in three ways — the database is a new snapshot
each day, `uploads/` is an incremental mirror since a picture never changes
once written, and `secret.key` is overwritten in one place because it never
changes at all. The key travels because it is what the hashes in `events` and
the blocks are salted with: restore the database without it and every block
stops matching, with nothing to say so.

The database is copied with SQLite's online backup API and never with `cp`. A
WAL database is two files while the wiki is running, and a copy of the main one
alone is missing whatever was written since the last checkpoint — a loss you
find out about when you come to restore.

To restore: take the newest `namba_<timestamp>.db.gz` and `namba_secret.key`
from the bucket, gunzip, and put them at `/data/namba.db` and `/data/secret.key`
on the volume. Check the copy before trusting it — `PRAGMA integrity_check`,
and a row count against what the wiki says. Verified that way on 2026-09-10:
the snapshot opened clean and matched the live database entry for entry.

The admin session cookie is `SameSite=Strict`, and `Secure` whenever the request
arrived over https. That is what stands in for a CSRF token — the panel is
same-origin with the API, so nothing legitimate is a cross-site request — and it
holds only while CORS credentials stay off. **Do not turn on
`allow_credentials`**: `allow_origins` is `*` so the API can be read from
anywhere, and that is harmless precisely because a browser will not send this
cookie to another origin. `test_admin_accounts` asserts it stays off.

The public API is readable from any origin and writable from this one. CORS
allows only `GET`, so a JSON write from another site fails its preflight, and
every write refuses `Sec-Fetch-Site: cross-site`, the header browsers attach to
the requests that never preflight. `curl` sends neither and is unaffected.

## Known gaps

- 20 seeded entries still have Korean titles (`아비정전`, `36계 줄행랑`). Left
  verbatim rather than machine-translated — the wiki should fix them, now by
  adding an English tab beside the original.
- `801.11` is in the data as written; the Wi-Fi standard is `802.11`.
- Search is `LIKE`, on both sides. Fine for thousands of rows, not for millions.
- **The abuse view counts; it does not detect.** Writes per client per window,
  and the one pattern a query answers outright — the same paragraph filed under
  three or more numbers. The rest of what the shape is there for (an entry
  rewritten in a loop, a campaign spread thin over a day) needs a scoring pass
  that has not been written. Every write is already in `events`, which is what
  it would read.
- **A purge does not reach the entry's rows in `events`** — the nickname typed,
  three salted hashes, whatever `meta` held. `events` is append-only by
  convention and that is the only thing making it a log an operator cannot tidy
  up after themselves in; on a wiki this size that is worth more than closing
  the gap. Weighed and declined rather than missed, and there is no retention
  sweep on the hashes either.
- **No bulk actions in the panel.** They double every confirmation and
  partial-failure path for an operator who has one account and twenty rows.
- The write limiter and the login limiter both live in process memory, so both
  are per-worker. Run one worker, or move them to redis.
- The back office has no front-end tests, because the front end has no test
  runner and that is deliberate. Every route it calls is covered on the API
  side; the layout is checked by looking at it.
