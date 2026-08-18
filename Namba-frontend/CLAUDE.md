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
- `Home` is a list, not a grid: one row per number, the value right-aligned in a
  fixed 108px column so the numerals line up down the page, and its entry titles
  linking straight to their posts. It reads like the source `Memorable
  Numbers.md` on purpose. Values longer than 10 characters get `.long` and shrink
  rather than widening the column for every "7".
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
not on a route of its own; there is no `/p/:id/history`. Restoring from there
creates a new revision, so bump `revBump` to refetch the list — the post itself
comes back from the endpoint and is set directly, which avoids a loading flash.

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
