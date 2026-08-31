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
`cd Namba-backend && .venv/bin/python admin.py add you@example.com`.

Before claiming anything works:

```sh
cd Namba-backend  && .venv/bin/python test_namba.py   # asserts, no pytest
cd Namba-frontend && npx tsc --noEmit && npx oxlint src && npm run build
```

## Kept in sync by hand

One list is duplicated across the apps on purpose (no codegen, no shared
package). **Change one, change the other:**

| what | backend | frontend |
|---|---|---|
| the 4 number formats | `numfmt.py` `FORMATS` | `src/api.ts` `FORMATS` |
| the two tag limits | `main.py` `TAG_MAX`, `TAGS_PER_POST` | `src/api.ts`, same names |
| the moderation vocabularies | `db.py` `DELETE_REASONS`, `REPORT_REASONS`, `POST_STATUSES`, `REQUEST_STATUSES`, `REPORT_STATUSES`, `BLOCK_TYPES`, `BLOCK_HOURS` | `src/api.ts`, same names |

`test_the_two_apps_still_agree` in `test_namba.py` reads `src/api.ts` and checks
every row of that table, so "change one, change the other" is a thing the suite
notices rather than a thing you remember. It parses the TypeScript; it does not
generate either side from the other, because moving the pair in one commit is
the design and codegen is what this repo declined.

That test is there because the 422 only catches drift one way. The backend
rejects an unknown format, a tag past either limit and an invented reason — so a
frontend-only change fails loudly. A **backend**-only one does not: add a reason
here and forget `api.ts` and nothing errors, the choice is simply missing from a
menu and nobody finds out. The five vocabularies live in `db.py` rather than
beside the routes because they are what the `TEXT` columns may hold, and both
`main.py` and `admin_api.py` need them without importing each other.

They are **not** SQL `CHECK` constraints, and that is a trade rather than an
oversight: `CREATE TABLE IF NOT EXISTS` skips a database that already exists and
SQLite cannot `ALTER` a `CHECK` in afterwards, so the rule would hold on fresh
installs and be absent on upgraded ones. One enforced rule in Pydantic beats two
different databases.

There used to be a second row here for the 20 category tags. Tags are
free-form now: the backend checks a tag's shape, never its membership, and
`/api/tags` reports the vocabulary actually in use. A format is a parser
branch and has to be agreed on; a tag never did.

## Design decisions that are not up for quiet revision

- **No *reader* accounts, ever.** No signup, no ownership, no per-post
  permissions, no "my posts". Anyone reads, posts and edits with no login and no
  identity beyond a nickname they type, and every guard in the public API assumes
  it — do not "fix" the open half by adding auth to it.

  There is exactly one exception and it is scoped on purpose: `admins`, the
  operators. This line used to say "no accounts, ever", and it was revised
  deliberately rather than quietly, because an operator's decision has to carry
  a name and be undoable, and neither is possible for nobody. What that buys is
  the back office — a dashboard, moderation, delete requests, reports, blocks and
  an audit log — and what it must never buy is a reader account. There is no
  signup route to find. The first operator can only come from a shell
  (`admin.py add`), and every one after that from a super admin inside the
  panel. If a feature needs a reader to log in, the answer is that the feature
  is wrong for this wiki.
- **Nothing removes an entry.** `posts.status` is `ACTIVE` / `HIDDEN` /
  `DELETED`, and a hidden entry drops out of all twelve public reads and comes
  back whole. There is no `DELETE /api/posts/{id}` — the path answers 405 — and
  no delete button anywhere in the front end. An open wiki where one click can
  take a page away has no defence at all, and the fix is not confirming harder:
  it is that the click does not exist. `admin.py hide` is what moderation
  means here, and `admin.py purge` is the one hard delete, in the shell,
  for the removal a law requires. Do not add a delete route back.
- **`author` is the first writer and is never overwritten.** An edit records the
  editor in `edited_by` instead. Without this, a stranger correcting a typo takes
  over the byline, which on an open wiki is most edits. `test_api_round_trip`
  asserts it.
- **A number is a column, not a table.** `/n/42` is a query on `posts.value`.
  Adding a `numbers` table would buy nothing. This is also why thousands
  separators are a display flag (`posts.grouped`) and never live in `value`:
  the moment `1,000` is storable, `/n/1000` and `/n/1%2C000` are two pages
  about one number.
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
  is paid by `admin.py purge`: it takes the entry, its snapshots and its
  picture, and leaves the entry's event rows holding the nickname typed, three
  salted hashes and whatever is in `meta`. So the one hard delete does not
  reach everything about a purged entry, and there is no retention sweep
  expiring the hashes either. Both were weighed and declined — a wiki this
  size gets more out of a log nobody can edit than out of a redaction. Neither
  is a bug to fix in passing: revising this means saying so here first.

- **Everything readers write is CC0.** Public domain, stated where it is given
  away — a line at the form's Publish button, not only in the footer, because a
  waiver read after the fact is not one. The byline still stands: `author` is a
  record of who got there first, not a right retained.
## Working here

Prefer editing what exists over adding files — this is deliberately a small
codebase (~13,500 lines, tests and CSS included). Each app has its own
`CLAUDE.md` with the details that bite.

**Commit in logical units, without being asked.** One coherent change per
commit — the feature, then the doc note, not both in a heap at the end of a
session. Run the checks above before each one. Pushing is a separate decision:
`origin` is `github.com/MIIRAIII/Namba`, and whether a commit goes there is the
user's call, not a default — commit freely, push when asked.

Messages follow [Conventional Commits](https://www.conventionalcommits.org):
`type(scope): subject` — imperative, lowercase after the colon, no trailing
period. Types: `feat` `fix` `docs` `style` `refactor` `test` `chore`. Scope is what
changed (`backend`, `frontend`, `index`, `seed`, `api`) and is dropped when the
change spans both apps. The body explains why, not what — the diff has the what.
