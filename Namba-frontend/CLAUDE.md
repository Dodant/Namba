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

The one that earned its place is **`react-markdown`** (with `remark-gfm` and
`remark-breaks`), for the entry body. It renders to React elements and escapes
raw HTML, so `<script>` and `<img onerror>` in a post arrive as text and
`javascript:` hrefs come out empty — on a wiki anyone can write to, that
default *is* the security model. **Do not add `rehype-raw`.** It turns that off,
and the moment it goes in this app needs a sanitiser it does not currently have
and a reason nobody has offered. It costs about 47 kB gzipped, which is the
trade: a `marked` + `dompurify` pair is a third of that and hands you the
sanitiser config to get wrong.

- Styling is `src/index.css` alone: CSS custom properties on `:root`, dark mode
  via `prefers-color-scheme`. Numerals use `--mono` with `tabular-nums` — that
  alignment is the whole visual identity, keep it.
- Every control the reader types in or presses is a capsule —
  `border-radius: 999px` — buttons, chips, selects and inputs alike. The
  textarea is the one exception: at 104px tall a 999px radius is a half-circle
  at each end and the text runs into it, so it takes 20px. Containers are not
  controls and keep `--radius`: panels, cards, the picker, images.
- Selects are real `<select>`s and stay that way. The dropdown is styled with
  `appearance: base-select` and `::picker(select)` behind an `@supports`, so
  Chrome 135+ gets the picker in the page's own palette and everything else
  gets the OS menu it already had. Do not replace one with a div-and-`<ul>`
  listbox to style it in more browsers — keyboard, type-ahead, mobile and
  screen readers all come free here and all have to be rebuilt by hand there.
  Options set no font of their own: they inherit, so a field's picker is
  Newsreader like the field and the header pill's is mono like the pill.
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
  column for every "7". Each band is a `<details>` open by default, and the
  category filter is the same thing closed by default — the browser owns the
  collapse, so there is no open state to hold anywhere. A closed filter still
  shows the tag that is on, or it would hide why the list is short. `Feed` is
  `sort=recent` off `/api/posts` — `updated_at DESC`, so a rewrite brings an old
  entry back up. It is labelled `Recent` in the header and the component is
  still `Feed`: the label names the order, `?view=feed` names the shape. One
  sort, not two — do not add a `sort=new` beside it.
- `useAsync.ts` carries a file-level `oxlint-disable react-hooks/exhaustive-deps`
  because the hook forwards its caller's deps array, which the rule cannot verify
  statically. That is the one suppression in the codebase; do not add more.
- `PostCard.tsx` must export only components (fast refresh). Shared helpers like
  `fmtDate` and `numberPath` live in `api.ts`.
- Markdown renders on `/p/:id` only. Every list shows `plain(body)` — the source
  read back as prose, so `**bold**` and `## ` are not punctuation in a preview —
  clamped to three lines in CSS. `plain()` is a handful of regexes and is not a
  parser; it does not need to be, because the entry itself is one click away.

## The reader's language

`displayLang` in `api.ts` (`localStorage`, defaults to `English`) is which
language lists render in. `App` holds it in state and hands it to `Home` and
`Browse` as a prop, which is the point: a page only refetches when a value it
renders with changes, and a page reading `localStorage` itself would not notice
the header. It is not a search param — it is a standing preference, and every
internal `Link` would have to carry it or drop it.

An entry with no translation in that language keeps its own title. Nothing
marks the difference in a list, so a mixed-language index is expected.

The form's two language fields — `Written in` and the one in the Languages
panel — are `<select>`s over `LANGS` in `PostForm.tsx`, and typing is not an
option. Free text gets one language written three ways ("Korean", "한국어",
"korean"), which reads as three languages and filters as three. Unlike a tag,
nobody is coining a language, so a list is not a claim about what people may
mean. They are endonyms — the name a language calls itself is the one a reader
of it recognises.

`LANGS` is **not** mirrored anywhere: the backend still takes any 40-character
string, and `/api/languages` still reports what the wiki actually says rather
than this list. Adding a language is one line here and no migration. Taking one
out is safe too — `langsWith()` keeps an entry's existing language on the menu
so the form cannot drop it on the next save.

The Format select reshapes the Number field beside it: Integer and Decimal
filter what can be typed and offer the separator checkbox, Mixed and Time are
plain text with no checkbox, and Auto-detect constrains nothing because nothing
has been decided yet. Filtering happens as you type and **never** rewrites what
is already in the field — picking Integer by mistake with `11/22/63` in there
must not turn it into `112263`.

`showValue(value, grouped)` is display only — **never build a link from it.**
`numberPath()` takes the raw value, and `/n/1,000` is a different page from
`/n/1000`. Index rows and the `/n/:value` hero use the all-entries-agree rule
from the API; everywhere a single post is shown, its own flag wins.

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

`/random` is a route, not a header `onClick`, so it is linkable and has
somewhere to render its wait and its failure. It replaces rather than pushes —
pushing puts `/random` in the history, and Back from the entry rolls again.
It rides on `sort=random` in `list_posts`, which is guarded by a test: an
unknown `sort` falls back to `p.id` instead of 422ing, so a typo either side of
the wire is a Random button that works and always lands on the same entry.

Edit history lives in the right-hand `<aside className="side">` of `PostPage`,
not on a route of its own; there is no `/p/:id/history`. It is a read-only
timeline — restoring happens in the History rail of `PostForm`, which is the
same side of the page so that Edit does not move it.

## Read routes read, the edit route writes

`/p/:id` has exactly one write control: the `Edit` pill in its meta row.
Adding a language, rewriting one, unlinking a related entry, restoring a
revision and deleting the entry all live in `/p/:id/edit` — Languages and
Related entries as bordered panels in the form, History on a rail to the right
of it (`.form-layout`, the same shape the read page has). Do not put any of
them back on the read page — that is where they all were, in five different places, and the fix was
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

`FORMATS` in `api.ts` is a hand-copy of `numfmt.py`. Changing it here alone gets
a 422 from the API. Tags are **not** a list any more — do not add one back. The
form's chips come from `api.tags()`, which reports what the wiki actually uses,
and `toggleTag()` normalises a typed tag the same way the API will so that
"Book" turns the existing book chip on rather than looking like a second one.

Tags are lower-case everywhere — stored, displayed, and folded in the coin
field as you type. `tagLabel()` used to sentence-case them and is now just a
`toLowerCase()`; it stays a function because `/t/:tag` can arrive from an old
upper-case link and one place has to decide.

## No accounts

The nickname and the set of liked post ids live in `localStorage` (`nickname`,
`liked` in `api.ts`). There is no session, no user object, and no "my posts".
Likes update optimistically and roll back on failure.

The nickname a form submits is the *editor*, never the author — `post.author` is
whoever wrote the entry first and is display-only here. Show both wherever a byline
appears (`written by {author} … edited by {edited_by}`).

## Production

`npm run build` → `dist/`, and **the API serves it** — `main.py` has a catch-all
that returns built assets by path and `index.html` for everything else, so no
rewrite rule is needed for `/n/42`. Build before starting the backend, or that
route 404s with a message saying so.

That is also where `/p/:id` gets its Open Graph tags. Setting them from React is
not an option and never was: a crawler does not run the JS that would do it, so
the `<head>` has to arrive already written. Nothing in this app should try.

`vite.config.ts`'s proxy is a development convenience only — in production there
is one origin and nothing to proxy.
