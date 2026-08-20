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
- `--muted`, `--faint` and `--fainter` are set by their contrast against
  `--bg` — 5.6, 5.1 and 4.6 to 1 — not by eye, in both themes. They carry the
  field hints, placeholders and byline rows, which is most of the instruction
  on the page, and they were at 3.4, 2.6 and 2.2 in the light theme until it
  was measured. They will look too dark next to a mockup that never had to be
  read at 10px; that is the trade, and lightening one is a regression, not a
  polish. Four legible greys under `--ink-soft` is a narrow band on purpose.
- Every control the reader types in or presses is a capsule —
  `border-radius: 999px` — buttons, chips, selects and inputs alike. The
  textarea is the one exception: at 104px tall a 999px radius is a half-circle
  at each end and the text runs into it, so it takes 20px. Containers are not
  controls and keep `--radius`: panels, cards, the picker, images.
- The focus ring sets no `border-radius` of its own. An outline already
  follows the radius the element has, and the rule used to force 3px — which
  squared off every capsule for as long as it held the focus.
- Hover is a 120ms colour transition and nothing else moves. No transform, no
  size change, so a pointer running down a list of rows leaves no trail. A
  `prefers-reduced-motion` block cuts it.
- 24px is the floor for anything you press. The two borderless like buttons
  keep their 10.5px type and buy the target with padding, then hand it back
  to the row with a matching negative margin, so the hit box grows and the
  layout does not move. Do not "tidy" the negative margins away. On a coarse
  pointer the same trade is made once more, in the `@media (pointer: coarse)`
  block at the foot of the file, which lands the small controls at 33–40px. A
  width query cannot ask that question: an iPad at 1024px needs it and a 480px
  window on a desktop does not.
- `overflow-wrap: break-word` is inherited from `body`, and the two
  single-column grid overrides say `minmax(0, 1fr)`. Both are there because
  a title is a string a stranger typed: one unbreakable word used to widen
  the document to four times the viewport. `break-word`, not `anywhere` —
  `anywhere` feeds min-content sizing and collapses the columns. The
  numerals keep their own `anywhere`, which is deliberate and different.
  `break-word` cannot save a box that is *sized* to the whole word, which is
  what a column flex with `align-items: flex-start` does to its children:
  `.rev b, .rev span` carry `max-width: 100%` for exactly that, or one long
  revision title takes the document out to 1008px on a 390px screen.
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
  Newsreader. The wordmark is Newsreader too — a masthead speaks in the page's
  own voice — over a mono strapline, which is where that pairing comes from.
  It is not a third face and must not become one.
- `Home` has two views off one `?view=` param, `Index` (default) and `Feed`, and
  they are two components rather than one with a branch through its hooks —
  otherwise it fetches both. `Index` is a list, not a grid: one row per number,
  the value right-aligned in a fixed 104px column so the numerals line up down
  the page. It reads like the source `Memorable Numbers.md` on purpose. Values
  longer than 7 characters get `.long` and shrink rather than widening the
  column for every "7" — the class comes from `numSize()` in `api.ts`, shared
  with the feed rows, the cards and both heroes, because one font size either
  shouts at "7" or breaks on "1960년 4월 16일 오후 3시" and a viewport clamp
  cannot tell those apart. Each band is a `<details>` open by default, and the
  category filter is the same thing closed by default — the browser owns the
  collapse, so there is no open state to hold anywhere. A closed filter still
  shows the tag that is on, or it would hide why the list is short. A single
  number past `FOLD_OVER` entries is a third `<details>`, open, its summary
  the count: it is there to be closed by a reader who wants past a number the
  wiki has taken to, and it never hides an entry from one who did not ask.
  The numeral stays outside it — it links to `/n/:value`, and a link inside a
  summary is one click that has to be two things. Its rows need the
  `.ix-list` box: everything after a summary goes into one anonymous content
  box, so the column's `gap` lands between the summary and that box rather
  than between the rows in it. `Feed` is
  `sort=recent` off `/api/posts` — `updated_at DESC`, so a rewrite brings an old
  entry back up. It is labelled `Recent` in the header and the component is
  still `Feed`: the label names the order, `?view=feed` names the shape. One
  sort, not two — do not add a `sort=new` beside it.
- `useAsync.ts` carries a file-level `oxlint-disable react-hooks/exhaustive-deps`
  because the hook forwards its caller's deps array, which the rule cannot verify
  statically. That is the one suppression in the codebase; do not add more.
- `useAsync`'s third argument, `keep`, holds the last answer on screen while
  the next loads. Only `Index` and `Feed` pass it: their deps re-filter one
  list. Do not pass it from a page whose deps name a *subject* — `Browse` and
  `PostPage` would then draw the previous number's entries under this one's
  heading. A caller that opts in must label its rows off the rows and never
  off the deps (`shownFormat` in `Home`), because mid-load the two disagree.
- `ScrollTop` in `App` is what puts the reader at the top of a new page, on
  path *and* search, since every param here swaps one list for another. It is
  not decoration: before it, the only thing resetting the scroll was the lists
  blanking out on load, and the two changes had to land together. `POP` is
  exempt — Back is the reader's own position, and restoring it properly would
  mean storing an offset per history entry.
- `PostCard.tsx` must export only components (fast refresh). Shared helpers like
  `fmtDate` and `numberPath` live in `api.ts`.
- Markdown renders on `/p/:id` only. Every list shows `plain(body)` — the source
  read back as prose, so `**bold**` and `## ` are not punctuation in a preview —
  clamped to three lines in CSS. `plain()` is a handful of regexes and is not a
  parser; it does not need to be, because the entry itself is one click away.

## Four widths, and what changes shape at each

The breakpoints are places something stops fitting, not round numbers:

| px | what changes |
|---|---|
| 1130 | the form and its History rail stop fitting side by side (680+40+340) |
| 900 | the wordmark, search, language picker and three pills stop fitting one line |
| 820 | the entry and its Edit history rail stop fitting side by side |
| 560 | a phone: rows fold, the search takes a row, the numeral stops being a column |

Between them everything is `clamp()` — the page gutter, the section rhythm,
every heading and every numeral — so dragging a window from 1920 to 320 has
four places where the shape changes and none where a size jumps. Before
reaching for a fifth breakpoint, check whether the thing wants a clamp
instead. Two capability queries carry the rest: `(hover: hover)` for the like
count a pointer reveals, `(pointer: coarse)` for the sizes a fingertip needs.

What actually changes shape, rather than size:

- **The header.** One row above 900. Below it the wordmark keeps its line with
  the search, and the three pills take the line under it flush right; below 560
  the search takes a row of its own. `.acts` carries an explicit flex basis in
  both bands, so set `flex`, never `width` — an explicit basis beats `width`
  outright, and `width: 100%` on it did nothing at all.
- **A `.card` row** is `[number][title and blurb][thumbnail]` until 560, where
  it folds: number and thumbnail keep the top line, the prose takes the width
  under them. It was a 90px column of three-character lines before.
- **A `.panel-row`** puts its title on a line of its own below 560, whole,
  rather than an ellipsis at twelve characters.
- **`.spacer`** becomes a line break below 560 (`flex: 1 0 100%`), so Delete is
  never beside Save and Edit is never beside the tags under a thumb.
- **The rails** stop being rails and become the end of the page — and the
  Edit history stops being a 60dvh scroll port inside a scrolling page. That
  cap lives on `.side .revs`, not `.revs`: the same list is the recovery view
  on a deleted entry, where it is the page and holds the only Restore there is.

Mobile browsers, specifically: every box you type in is 16px on a coarse
pointer, because under that iOS Safari zooms the page in on focus and leaves it
zoomed — tapping the search pill used to hand back a wiki that scrolled
sideways. `dvh` rather than `vh` wherever a height is capped, since a phone's
toolbars make `vh` a promise it does not keep. `index.html` asks for
`viewport-fit=cover` and `.wrap` maxes its gutter against
`env(safe-area-inset-*)`, which is what keeps a line of text out from under the
notch in landscape; `maximum-scale` and `user-scalable=no` are not there and
must not be — pinch to zoom is how a reader reads a 10px byline.

A markdown table gets a scrolling wrapper from `components={MD}` in
`PostPage`, not `display: block` on the `<table>`. The old CSS did keep the
page still, but a table that is not a table box can stop being announced as
rows and columns, and six columns of data whose headers no longer attach is a
worse answer than a scrollbar.

Deliberately not done, so nobody re-derives them:

- **No hamburger, drawer or bottom bar.** The whole navigation is a search box
  and three pills; on a phone they are two rows that need no state, no focus
  trap and no scrim. A drawer for three links is more machinery than links.
- **No sticky header.** It is two rows tall on a phone, and this is a page you
  scroll a long index down.
- **The container stays 1160px on a 1920 screen.** An index of numbers is a
  book index and a 1800px title row is unreadable. What a wide screen buys goes
  into the rails instead — `.detail-layout`'s is `clamp(200px, 22vw, 280px)`.

## Every control has a name

A `<label>` in `.field` carries `htmlFor` and its control carries the
matching `id` from `useId` — not one of them wrapped its control, so before
this ten of the eleven fields on the form reached a screen reader as an
unnamed edit box. A caption that sits over a *group* rather than a control —
the category chips, and the Languages, Related entries and History panels —
is a `<span className="field-label">` inside a `role="group"` with
`aria-labelledby`, because a `<label>` there names nothing and is invalid.
`.field-label` and `.field label` are the same type; use the one that is
true.

A label and its hint need `{' '}` between them. JSX drops the newline, and
the accessible name comes out as "Titlewhat the number refers to". The space
is a whitespace-only flex item, so it is not rendered and costs nothing.

The hint is 10.5px/400 under a 10.5px/600 label. It was the larger of the
two, and the pair read as one string. The separation is weight: `--muted`
and `--fainter` are pinned by contrast and are not free to spend here.

Where a control is a toggle it says so — `aria-pressed` on the likes and the
category chips, `aria-current` on the format tabs, the language tabs and the
Recent pill. Every `Loading…` is a `role="status"` and every error a
`role="alert"`, which is what the three pages that blank their list on
navigation depend on.

## The reader's language

`displayLang` in `api.ts` (`localStorage`, defaults to `English`) is which
language lists render in. `App` holds it in state and hands it to `Home` and
`Browse` as a prop, which is the point: a page only refetches when a value it
renders with changes, and a page reading `localStorage` itself would not notice
the header. It is not a search param — it is a standing preference, and every
internal `Link` would have to carry it or drop it.

An entry with no translation in that language keeps its own title. Nothing
marks the difference in a list, so a mixed-language index is expected.

The header picker is not rendered at all while `/api/languages` is empty. On a
wiki nobody has translated yet its only entries are `Original` and the stored
default drawn as `English · 0` — two labels for the same nothing — and the
second is kept alive only by being selected, so choosing `Original` deletes it.
A control that opens to say no and loses an option when used is worse than no
control; it returns with the first translation.

The language tabs on `/p/:id` follow the same rule and are absent until the
entry has a translation. One tab is a rule drawn across the top of the page
to say the entry is written in the language you are already reading — and on
most of the wiki that was the first thing above the number.

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

All three heroes are one shape: a `.kicker` of metadata over an `<h1>` that is
the subject and nothing else. On `/n/:value` the kicker is the format and the
sort key; on the other two it is the kind of page and the count, and the count
waits for `posts.data` because "0 entries" before the fetch lands is a result
rather than a wait. `/t/:tag` passes its tag to `PostCard` as `except`, so a
row does not carry a chip linking to the page it is already on — what is left
is the tag that is news, on the entries that have two.

A link inside `.empty` is the only thing to do next on that page, so it is
drawn as a link. Do not let one inherit `--muted` off the paragraph.

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

`/p/:id` has exactly one control that changes the entry: the `Edit` pill in its
meta row. Adding a language, rewriting one, unlinking a related entry, restoring
a revision and deleting the entry all live in `/p/:id/edit` — Languages and
Related entries as bordered panels in the form, History on a rail to the right
of it (`.form-layout`, the same shape the read page has). Do not put any of them
back on the read page — that is where they all were, in five different places,
and the fix was to give them one home.

A like is the exception and is not one of them. It writes, but it writes a
counter beside the entry rather than the entry, so it sits in the meta row here
and on every card and index row, the same as anywhere else.

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

The nickname and the set of liked post ids live in `localStorage` — the keys
are `namba.nick` and `namba.liked`, wrapped as `nickname` and `liked` in
`api.ts`, and `namba.lang` is the third. There is no session, no user object,
and no "my posts".
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
