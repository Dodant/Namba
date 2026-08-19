# Namba-frontend

React 19 + Vite + TypeScript. `src/api.ts` is the entire client; four pages and
one component. Dev server proxies `/api` and `/uploads` to `127.0.0.1:8000`
(`vite.config.ts`) — no CORS config needed locally.

```sh
npm run dev
npx tsc --noEmit && npx oxlint src && npm run build    # all three must be clean
```

## Deliberately absent

No Redux/Zustand/React Query, no Tailwind, no component library, no test runner.
`useState` + `fetch` + one `index.css` covers this app. Reach for a dependency
only when a few lines genuinely will not do.

- Styling is `src/index.css` alone: CSS custom properties on `:root`, dark mode
  via `prefers-color-scheme`. Numerals use `--mono` with `tabular-nums` — that
  alignment is the whole visual identity, keep it.
- Two families, both from Google Fonts, linked in `index.html`: Newsreader for
  prose and IBM Plex Mono for `--mono`. It is the one external asset the app
  loads. If it is chrome or a number it is mono; if it is content prose it is
  Newsreader.
- `Home` has two views off one `?view=` param, `Index` (default) and `Feed`, and
  they are two components rather than one with a branch through its hooks —
  otherwise it fetches both. `Index` is a list, not a grid: one row per number,
  the value right-aligned in a fixed 104px column so the numerals line up down
  the page. It reads like the source `Memorable Numbers.md` on purpose. Values
  longer than 7 characters get `.long` and shrink rather than widening the
  column for every "7". Each band is a `<details>` open by default — the
  browser owns the collapse, so there is no open-band state to hold. `Feed` is
  `sort=new` off `/api/posts`, which the backend already had — do not add a
  `sort=recent` beside it.
- `useAsync.ts` carries a file-level `oxlint-disable react-hooks/exhaustive-deps`
  because the hook forwards its caller's deps array, which the rule cannot verify
  statically. That is the one suppression in the codebase; do not add more.
- `PostCard.tsx` must export only components (fast refresh). Shared helpers like
  `fmtDate` and `numberPath` live in `api.ts`.

## Number values are not URL-safe

`11/22/63`, `9¾`, `80/20` are all valid values. Always build number links with
`numberPath()` from `api.ts` (it does `encodeURIComponent`), and always pass the
value to the API as a **query param**, never a path segment — `%2F` in a path
gets normalised by the ASGI layer before routing.

Client-side routing decodes the segment correctly, which is why `/n/:value`
works but `/api/numbers/{value}` would not.

## Routes

`Browse.tsx` serves three of them — `/n/:value`, `/t/:tag`, `/search` — because
they differ only in which filter reaches `api.posts()`. Add a fourth list view by
extending its `mode`, not by copying the file.

Edit history lives in the right-hand `<aside className="side">` of `PostPage`,
not on a route of its own; there is no `/p/:id/history`. It is a read-only
timeline — restoring happens in the History panel of `PostForm`.

## Read routes read, the edit route writes

`/p/:id` has exactly one write control: the `Edit` pill in its meta row.
Adding a language, rewriting one, unlinking a related entry, restoring a
revision and deleting the entry all live in `/p/:id/edit`, as three bordered
panels between Details and Categories. Do not put any of them back on the read
page — that is where they all were, in five different places, and the fix was
to give them one home.

The exception is the deleted-entry recovery view in `PostPage`: when the post
404s but its revisions survive, `Restore` belongs there, because there is no
edit form to reach.

`PostForm` keeps two rules straight. A restore replaces the entry, so `fill()`
resets the fields to it. Linking or translating only changes what is around the
entry, so those `setPost()` and leave a half-typed title alone. `LinkPanel` and
`TranslationEditor` are deliberately **not** `<form>` elements — nested inside
the entry form, an inner submit bubbles out and publishes the entry.

## Mirrors the backend

`TAGS` and `FORMATS` in `api.ts` are hand-copies of `main.py` and `numfmt.py`.
Changing them here alone gets a 422 from the API.

## No accounts

The nickname and the set of liked post ids live in `localStorage` (`nickname`,
`liked` in `api.ts`). There is no session, no user object, and no "my posts".
Likes update optimistically and roll back on failure.

The nickname a form submits is the *editor*, never the author — `post.author` is
whoever wrote the entry first and is display-only here. Show both wherever a byline
appears (`written by {author} … edited by {edited_by}`).

## Production

`npm run build` → `dist/`. The host must serve `index.html` for unknown paths or
`/n/42` 404s on refresh, and the proxy targets in `vite.config.ts` need to point
at the real API host.
