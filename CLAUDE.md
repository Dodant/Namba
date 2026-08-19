# Namba

An open, no-login wiki of what numbers mean. Two apps in one git repo, no
monorepo tooling — `Namba-backend` (FastAPI + SQLite) and `Namba-frontend`
(React + Vite). One repo on purpose: the two lists below are hand-copied across
both apps, so keeping them in step has to be a single commit. Full walkthrough
in `README.md`.

## Running

```sh
cd Namba-backend  && .venv/bin/uvicorn main:app --reload   # :8000
cd Namba-frontend && npm run dev                           # :5173, proxies /api and /uploads
```

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

The backend rejects an unknown format with a 422 rather than dropping it, and
a tag past either limit the same way, so a frontend-only change fails loudly
rather than silently.

There used to be a second row here for the 20 category tags. Tags are
free-form now: the backend checks a tag's shape, never its membership, and
`/api/tags` reports the vocabulary actually in use. A format is a parser
branch and has to be agreed on; a tag never did.

## Design decisions that are not up for quiet revision

- **No accounts, ever.** No login, no ownership, no per-post permissions. Anyone
  reads, posts, edits and deletes. Every guard in the codebase assumes this — do
  not "fix" it by adding auth.
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

## Working here

Prefer editing what exists over adding files — this is deliberately a small
codebase (~4,400 lines, tests and CSS included). Each app has its own
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
