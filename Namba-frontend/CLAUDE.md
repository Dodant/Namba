# Namba-frontend

React 19 + Vite + TypeScript. **Two documents**: the wiki (`index.html` →
`src/`) and the back office (`admin.html` → `src/admin/`). The wiki is
`src/api.ts` plus four pages and two components; the back office is its own
shell, its own stylesheet and a page per thing an operator does. Dev server
proxies `/api`, `/uploads`, `/docs` and `/openapi.json` to `127.0.0.1:8000`
(`vite.config.ts`) — no CORS config needed locally.

## Two documents, and why

`/admin` is a second Vite entry, not a route in the wiki's bundle. The reason
that decides it is `index.css`: 1400 lines of global rules in which every
control is a `border-radius: 999px` capsule and the type is a serif meant for
reading, none of which belongs on a table of hashes. A separate document cannot
inherit it, and the build proves it — `main-*.css` is 26 kB and `admin-*.css` is
12, with nothing shared. The wiki's JS did not grow either.

`admin.css` keeps the identity and changes the register: same green, same
terracotta for anything destructive, IBM Plex Mono on every numeral (a back
office is mostly numerals) — but system sans for the chrome, 13px, 32px rows,
hairline rules, no radius over 6px. **Do not import `index.css` into the admin
app or `admin.css` into the wiki.** They define the same custom property names
with different values on purpose, and one document loading both would be neither.

Three things are shared and they are the right three: `req`, `qs` and `json`
from `src/api.ts`, so one place knows how FastAPI reports an error. Plus
`fmtDate` and `showValue`, because "2 days ago" and `1,234` should read the same
on both sides of the product. `src/admin/api.ts` adds the operator's shapes and
nothing else.

Getting there in development needs a rewrite, because `/admin` is a router path
and `admin.html` is a file: a small `configureServer` middleware in
`vite.config.ts` points `/admin*` at it. In production `main.py`'s catch-all
does the same thing. The `basename="/admin"` has to be identical in both, or
every link in the panel is wrong in one of them.

### Inside the panel

- **`NAV` in `AdminApp.tsx` is the rail.** One list, so a page cannot exist
  without appearing in it or appear in it without existing. Add a page by adding
  a line and a `<Route>`, never a link to something unbuilt.
- **The filters live in the URL, not in state.** Same call the wiki makes for
  its feed toggle: "everything flagged, oldest first" survives a reload, can be
  bookmarked, and can be sent to somebody. The search *box* is local and Enter
  commits — typing into the query fires a request per keystroke and puts every
  prefix of the word in the history. Any filter change clears `offset`, because
  page 4 of the old filter is not page 4 of the new one.
- **One entry is a page, not a drawer.** The diff needs the width, and an
  operator working a queue has to be able to send one to somebody. Requests,
  reports and blocks are drawers, since deciding one is a sentence.
- **The body is shown as source.** An operator judging vandalism wants the
  characters a stranger typed — a link's real href, a zero-width space, the
  twelve blank lines — not the paragraph they render into. This is the one place
  in the product that deliberately does not use `react-markdown`.
- **Editing goes to the wiki's own form.** `/p/:id/edit` in a new tab, as a
  plain `<a>` because it is another document. There is one place that knows how
  a number value is parsed and how `grouped` follows the commas, and a second
  editor in here would be a second answer.
- **`Confirm` is a native `<dialog>`.** `showModal()` brings the focus trap,
  Escape, `::backdrop` and an inert page; hand-rolling those is a hundred lines
  and half of them wrong. Not `window.confirm` either — it blocks the event loop
  and cannot hold the note field these actions want. Its copy always says what
  will happen *and what survives it*, because on this wiki the second half is
  the surprising one.
- **A diff line's sign is mapped to a class name, never interpolated.** `-` and
  `+` are not valid in one, and building it by template produced a rule the
  stylesheet could never match. `SIGN` in `Entry.tsx` is the mapping and
  `admin.css` names the same three.

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
- **The wiki's words select and the app's words do not.** One `:is()` list
  near the top of `index.css` holds the app's: every control, every label
  naming a section or a field, and every sentence the page says about itself
  — the form's heading and intro, the fine print, the empty states. What a
  reader wrote is what comes away with a drag: numerals, titles, blurbs,
  bodies, bylines. Nobody quotes "One entry per meaning" out of a wiki, and
  before this a drag from a title came away with "CATEGORIES 20 tags 1 - 9
  8 numbers" sitting on top of it. **Anything new that the app says, rather
  than the wiki, belongs in that list.**
- A field joins the page's selection only while it has the focus. Chrome
  computes `user-select: none` on an `<input>` as `none` and not the `contain`
  the spec asks for, so a blanket rule would cost you selecting what you
  typed; `:focus` buys it back, and in time, because a click focuses on
  mousedown before the drag begins. Without it, dragging over the form lit up
  every placeholder and the file input's "No file chosen" — none of which the
  copy ever actually contained.
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
  statically. There is one other in the whole codebase — a
  `eslint-disable-next-line` on the same rule in `src/admin/pages/Log.tsx`, where
  an effect drops a stale `offset` out of the query string and must not rerun
  when the params it writes come back. Two is the count; do not add a third.
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
  `fmtDate` and `entryPath` live in `api.ts`.
- **Every date is relative.** `fmtDate` is "4 minutes ago", "2 days ago",
  "5 months ago" — the same scale a feed uses, because every date on this wiki
  is a byline in a list, an edit in a history or a remark under an entry, and
  all three are read to answer how fresh a thing is. It is one function and
  eleven call sites in the wiki, one of them inside a template literal, which is
  why it returns a string and not a `<time>`. The exact timestamp is therefore
  nowhere on screen here, and where it is wanted it is a `title` on the element
  that carries the date, not a second format for lists to choose between — which
  is what the back office does, in `When` in `admin/ui.tsx` and in the nine
  further call sites behind it. Months are 30 days and a year is twelve of
  those, so "12 months ago" cannot happen.
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
| 560 | a phone: rows fold, the search takes a row, the numeral stops being a column, the format tabs drop to their short labels |

Between them everything is `clamp()` — the page gutter, the section rhythm,
every heading and every numeral — so dragging a window from 1920 to 320 has
four places where the shape changes and none where a size jumps. Before
reaching for a fifth breakpoint, check whether the thing wants a clamp
instead. Two capability queries carry the rest: `(hover: hover)` for the like
count a pointer reveals, `(pointer: coarse)` for the sizes a fingertip needs.

**320 is the floor, and `body` has `min-width: 320px` to say so.** It is the
number WCAG 2.1 1.4.10 names — content must reflow without a sideways scroll
at 320 CSS px — which makes it both the lowest floor worth declaring and the
highest one allowed. It is not a phone measurement: 320 is what a 1280px
desktop becomes at 400% zoom, and that reader is the reason for the rule.
Measured, the layout holds at exactly 320 and comes apart below it one piece
at a time — the band count at 280, the form's buttons at 220, the header into
three rows at 200. The format tabs used to be the first to go, at 300; they
scroll now and so have no width they come apart at. `min-width` collapses the
rest into one behaviour: under 320 nothing reflows further and the page scrolls
sideways whole. **So 320 is the width to test at, and nothing needs to work
under it.**

The tab strip is a scroll port and 1.4.10 is about the *page*: `body` still
never scrolls sideways at 320, and a strip you move along is the shape the
success criterion contemplates rather than the one it forbids. What the
criterion does ask for is that nothing is lost, which is why the strip is
scrolled to the tab you are on rather than left at its start.

What actually changes shape, rather than size:

- **The header.** One row above 900. Below it the wordmark keeps its line with
  the search, and the three pills take the line under it flush right; below 560
  the search takes a row of its own. In the 900 band the search carries
  `margin-left: auto` so the two rows end on the same edge: its 460px cap
  bites from about 740 up, and without the auto margin the slack it stops
  taking collects on its right, leaving the box 41px short of the pills at 768
  and 166px short at 900. The slack belongs on the wordmark's side, where
  there is nothing underneath to line up with. `.acts` carries an explicit flex basis in
  both bands, so set `flex`, never `width` — an explicit basis beats `width`
  outright, and `width: 100%` on it did nothing at all.
- **A `.card` row** is `[number][title and blurb][thumbnail]` until 560, where
  it folds: number and thumbnail keep the top line, the prose takes the width
  under them. It was a 90px column of three-character lines before.
- **A `.panel-row`** puts its title on a line of its own below 560, whole,
  rather than an ellipsis at twelve characters.
- **The format tabs scroll rather than shorten or wrap**, and they are the one
  strip that does. Five full labels are 400px of type against the 288 a 320px
  screen has. Wrapping made a strip two rows tall, which has stopped being a
  strip; shortening them to `Int. Dec. Mix. Time Abbr.` fit, and cost every tab
  its name. `.tabs.fmts` is `nowrap` + `overflow-x: auto` with **no media
  query** — overflow is inert until something overflows, so one rule does
  nothing above about 430px and the right thing below it, and a sixth format
  would need no re-measuring. `flex: none` on the children is not optional: a
  nowrap flex row shrinks them by default, which compresses the labels instead
  of overflowing them.

  **The scroll is only half of it.** The tab you are on can start off the end
  of the strip, and four tabs with no underline on any of them is a page that
  looks like it belongs to none of them — which is what the first attempt at
  this actually did on `/?format=ABBR`. `Index` in `Home.tsx` holds a ref on
  the `<nav>` and a **layout** effect that calls `scrollIntoView({ inline:
  'nearest', block: 'nearest' })` on `[aria-current="page"]`. Each half of that
  is load-bearing: `inline: 'nearest'` moves the strip the least that will do,
  so a tab you reached by tapping it does not slide under your finger;
  `block: 'nearest'` keeps it off the *vertical* scroll, where it would fight
  `ScrollTop` in `App` for where the page starts; and a layout effect rather
  than an effect, or the first paint is at `scrollLeft` 0 and the strip visibly
  jumps. Nothing in CSS can ask which tab is current, so this cannot be moved
  into the stylesheet.

  The scrollbar is hidden (`scrollbar-width: none` and the `-webkit`
  pseudo-element) and the tab half-cut at the edge is the cue in its place —
  the affordance every native tab strip uses, and there is no pointer at these
  widths to want the bar. `overscroll-behavior-x: contain` because iOS reads a
  swipe past the end of a horizontal scroller as Back, and flicking through
  five tabs must not leave the page.

  **The language tabs on `/p/:id` share `.tabs` and deliberately do not get
  this.** They are `.tabs langs`, they wrap, and they should: they are
  user-supplied with no bound on how many an entry collects, so a strip of them
  is a list to read rather than a row to move along, and wrapped, all of it is
  on screen. Scope anything you add here to `.fmts` or you will change both.
- **`.spacer`** becomes a line break below 560 (`flex: 1 0 100%`), so the
  destructive button — Remove this language — is never beside Save, and the
  credits toggle and Edit take a line of their own rather than sitting beside
  the tags under a thumb.
- **The rails** stop being rails and become the end of the page — and the
  Edit history stops being a 60dvh scroll port inside a scrolling page. That
  cap lives on `.side .revs`, not `.revs`: the same list is the recovery view
  in `PostPage`, where it is the page and holds the only Restore there is.

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
of it recognises — each shown with its ISO 639-1 code, `한국어 (ko)`, because an
endonym only recognises the reader back: `ไทย` and `العربية` say nothing to
everyone else and `(th)` and `(ar)` do. `LANG_CODE` is the list itself rather
than a table of codes beside one, so adding a language is still one line. The
code is **display only** — `lang` is stored as the name, `/api/languages`
counts the names, and `langLabel()` falls back to the bare name for a language
`langsWith()` kept but the map has never heard of.

`Written in` has no empty choice: `LANGS[0]` — English, because the wiki is
English-first — is what a new entry starts on and what an entry with nothing
recorded picks up the next time it is saved. The field used to default to
`Not set`, so most entries recorded no language at all and the credits line
under them fell back to "As first entered".

The Languages panel's first row says `Original (English)` off the **field
above it**, not off the saved `post.lang` — the select is what the entry will
be written in the moment it saves, and a row still reading plain `Original`
disagrees with it on screen. That live value also drops out of the Add-a-
language menu along with every language already on the list: `UNIQUE(post_id,
lang)` turns a second write in the same language into an edit of the version
already there, so an Add that offered it would quietly overwrite one, and a
translation into the entry's own language is the entry twice. Rewriting keeps
its own language on the menu, or the select would show nothing.

`LANGS` is **not** mirrored anywhere: the backend still takes any 40-character
string, and `/api/languages` still reports what the wiki actually says rather
than this list. Adding a language is one line here and no migration. Taking one
out is safe too — `langsWith()` keeps an entry's existing language on the menu
so the form cannot drop it on the next save.

The Format select reshapes the field beside it, down to that field's own label
— with Abbreviation picked, "Number" is the wrong word for the box you are
typing `UFO` into, so the label reads Abbreviation, the filter keeps letters and
drops digits, and what is typed is folded to upper case because that is how the
API will store it. Integer and Decimal filter what can be typed and offer the
separator checkbox — from the fourth
digit, because there is no thousand in `100` and a box that ticks with nothing
on the page changing reads as broken rather than as inapplicable. It asks
`showValue(value, true) !== value` rather than counting digits: that is the
function that decides, and it knows `3.14159` has nothing to group after the
point. The tick survives a value dropping back under four digits — `grouped`
is display only, so nothing shows until the digit comes back.

The checkbox sits under the Number
field, where it stays out of the top row — a third column that came and went
with the format re-measured Number and Format underneath the choice, and the
preview it carries belongs under the number it rewrites. The two controls in
that row are given one height in `index.css` rather than each taking its own:
24px of number against 15.5px of select is a pair that sits crooked. Mixed and Time are
plain text with no checkbox and Abbreviation is the third with none — there is
no thousand in `UFO` — and Auto-detect constrains nothing because nothing
has been decided yet. Filtering happens as you type and **never** rewrites what
is already in the field — picking Integer by mistake with `11/22/63` in there
must not turn it into `112263`.

On an **edit** the value field is `readOnly` and its hint says so. An entry is
one meaning of one value and `/n/:value` is a query on that column, so
retyping it there would not correct the entry — it would move it to a page
about a different number and leave the old one short a meaning. Format and the
separator checkbox stay editable either way: they change how the same
characters are read, not which value the entry is about — though changing an
entry to Abbreviation does fold its value to upper case and move it to `/a/`,
which is the format deciding the spelling and the address, not the field being
retyped. `readOnly` and not `disabled` —
the number is the first thing you check before editing the rest, and `disabled`
takes it out of the tab order and announces it as unavailable.

`showValue(value, grouped)` is display only — **never build a link from it.**
`entryPath()` takes the raw value, and `/n/1,000` is a different page from
`/n/1000`. Index rows and the `/n/:value` hero use the all-entries-agree rule
from the API; everywhere a single post is shown, its own flag wins.

## Values are not URL-safe

`11/22/63`, `9¾`, `80/20` are all valid values. Always build a value's link with
`entryPath()` from `api.ts` (it does `encodeURIComponent`), and always pass the
value to the API as a **query param**, never a path segment — `%2F` in a path
gets normalised by the ASGI layer before routing.

`entryPath()` takes the format as well as the value, because the format is what
decides the address: `/a/UFO` for an abbreviation, `/n/42` for a number. Take it
off the row you are drawing — a poster may file `UFO` as Mixed on purpose, and
that entry is at `/n/UFO`. It is the twin of `value_path()` in `main.py`, which
writes the same link into every canonical and breadcrumb.

Client-side routing decodes the segment correctly, which is why `/n/:value`
works but `/api/numbers/{value}` would not.

## Routes

`Browse.tsx` serves four of them — `/n/:value`, `/a/:value`, `/t/:tag`,
`/search` — because they differ only in which filter reaches `api.posts()`. Add
a fifth list view by extending its `mode`, not by copying the file.

`/n/` and `/a/` are two sections over one column and the mode is what picks
between them: it sends `section` to the API, folds the value to upper case for
`/a/` so that an old `/a/ufo` link still lands, and chooses the noun the hero
uses. An entry has exactly one address — an abbreviation never answers at `/n/`
— and `section_where()` in `main.py` is the single condition that says so.

All four heroes are one shape: a `.kicker` of metadata over an `<h1>` that is
the subject and nothing else. On `/n/:value` and `/a/:value` the kicker is the
format and the sort key, which for an abbreviation is the format alone; on the
other two it is the kind of page and the count, and the count
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

Comments are under it, in the same rail: how the entry got here, then what
people make of it. **Both sections are a `<details>`; comments arrive open and
the edit history arrives shut**, because one is the page continuing and the
other is a record you go looking for — the history's summary carries the edit
count, so shut is still an answer. Neither remembers which way you left it, the
same as the credits toggle: press it and it is closed for as long as you want it
closed. The `<summary>` wears `.ix-fold`, which is where
its caret, its hidden marker and its 24px hit box come from; the `<h4>` stays a
heading *inside* it, so it is still in the outline and still announced as one.
Nesting a fold in a fold is deliberate: the section, then the rest of the
comments inside it.

Each summary carries a count in a `.n` beside its heading — "Edit history 2",
"Comments 3" — and only when there is one to carry: a section with nothing in it
says so in the line underneath, and a `0` before the fetch lands is an answer
where a wait belongs. **The figure alone, unlike a band on the index**, which
says "12 entries" under a heading of "Under 100": here the heading is the noun
already, and "Comments 8 comments" is the word twice in a row. It counts the
rows *below it*, which `REVISIONS_SHOWN` caps at 50 — a true total would have to
come off the API, and nothing needs one yet. The `.n` needs no font or rule of
its own: it inherits `.ix-fold`'s, and the 7px between it and the heading is
that flex row's `gap`. What it does need is the `{' '}` before it, or the
summary is announced as "Edit history2".

The two sections are divided by a rule (`.side > details + details`), not by
space alone: folded shut, Edit history is one line, and two headings 20px apart
is the gap a heading keeps from its own list everywhere else on this page.

Five, then a `<details>` fold whose summary is the rest's count — the same disclosure the index uses for a number with more entries than a
screen, so the browser owns the collapse and there is no open state anywhere.
The body is plain text on `white-space: pre-wrap` and not markdown: a remark is
a remark, and React escapes it, so there is nothing here to sanitise. `api.comment()`
answers with the whole list, which is why nothing refetches and there is no bump
dep — what came back *is* the state.

**The rail is a scroll port now, and that is what makes the form in it
reachable.** A `position: sticky` box taller than the viewport pins its top and
leaves its bottom out of reach, and the bottom is the box you type in — so the
cap moved out one level, from `.side .revs` to `.side`. The list keeps a cap of
its own, lowered to `min(40dvh, 320px)`: fifty revisions are 2700px of rail to
scroll past before reaching the comment box, and an entry that has been fought
over is exactly the one with something to discuss. Below 820 both caps lift and
the page is the scroller again.

## Read routes read, the edit route writes

`/p/:id` has exactly one control that changes the entry: `Edit`, at the far end
of the meta row, paired with the credits toggle by a `/` and wearing the same
`.meta-btn` as it. It has been a pill beside the tags and a pill at the foot of
the article; what was wrong with the first was the pill, not the place — a
filled capsule at the top of the page offers to change an entry nobody has read
yet. Quiet, at the end of the row, it is a control you find when you look for
one, which is what an edit link on a wiki is.

Adding a language, rewriting one, unlinking a related entry and restoring a
revision all live in `/p/:id/edit` — Languages and Related entries as bordered
panels in the form, History on a rail to the right of it (`.form-layout`, the
same shape the read page has). Do not put any of them back on the read page —
that is where they all were, in five different places, and the fix was to give
them one home.

**Deleting is not one of them and no longer happens here at all.** The form
used to carry a `Delete this entry` button and `api.remove()` behind it; both
are gone, and `DELETE /api/posts/{id}` answers 405. Removing an entry is a
request an operator decides, and hiding one is a column the operator sets. Do
not put a delete button back in this form — the whole point is that the wiki
cannot lose an entry to one stranger's click.

Where it went is `FlagPanel`, the third `<details>` in the read page's rail. It
is on the read page for the reason the comment box is: it writes something
*beside* the entry rather than changing it. It carries both halves — "something
is wrong" and "it should be removed" — behind one toggle rather than two folds,
because the fields are identical apart from the reason list and a rail with four
sections is a rail nobody reaches the bottom of. Switching sides clears the
chosen reason on purpose: four of the ten reasons are in both lists, so keeping
it would carry "Vandalism" across and silently drop "An advertisement". Only the
removal half asks for a nickname, because only that half has one on the API — a
report is read once by one person, and a byline on it would only ever be a name
to hold against somebody. On success the form is replaced rather than re-offered:
the API refuses a second open one from the same reader, and showing the box again
just to answer 409 is the app pretending it did not take this.

A like is the exception and is not one of them. It writes, but it writes a
counter beside the entry rather than the entry, so it sits in the meta row here
and on every card and index row, the same as anywhere else.

**A comment is the second one, and for the same reason.** It writes something
*beside* the entry, so it belongs where the entry is read rather than at `/edit`
with the five controls that change it — a reader who wants to say the number
means something slightly different should not have to open the editor to say so.
Nothing on the page rewrites or removes one: with no accounts a Remove button
belongs to nobody, and unlike an entry a comment has no revision behind it, so
the button would be the loss rather than the guard against it. If that ever
needs answering, it is a delete *and* an undo, not a delete.

The exception is the recovery view in `PostPage`: when the post 404s but its
revisions survive, `Restore` belongs there, because there is no edit form to
reach. Nothing new can land in that state — no route removes a row — but the
entries the old `DELETE` route took away are still out there with their
snapshots, and this is the only door back to them.

`PostForm` keeps two rules straight. A restore replaces the entry, so `fill()`
resets the fields to it. Linking or translating only changes what is around the
entry, so those `setPost()` and leave a half-typed title alone. `LinkPanel` and
`TranslationEditor` are deliberately **not** `<form>` elements — nested inside
the entry form, an inner submit bubbles out and publishes the entry.

## Mirrors the backend

`FORMATS` in `api.ts` is a hand-copy of `numfmt.py` — five of them now, four
ways of reading digits and `ABBR` for letters. `FORMAT_LABEL` and `numfmt.py`'s
parser branch have to gain a line with it: the backend 422s an unknown format,
but a format missing from the label map renders as `undefined` in a tab and
nothing errors. The five moderation
vocabularies — `DELETE_REASONS`, `REPORT_REASONS`, `POST_STATUSES`,
`REQUEST_STATUSES`, `REPORT_STATUSES` — are hand-copies of `db.py`. Changing any
of them here alone gets a 422 from the API. `REASON_LABEL` is one map for both
reason lists, because four reasons are in each and a reader picking one neither
knows nor cares which list it came from. Tags are **not** a list any more — do not add one back. The
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

That is also where the `<head>` comes from — all of it, for every route.
Setting it from React is not an option and never was: a crawler does not run the
JS that would do it, so the head has to arrive already written. **Nothing in this
app should try**, and nothing in `src/` mentions `og:`, `canonical` or
`ld+json` — grep and see.

`main.py`'s `_index()` writes a title, description, canonical, `og:`/`twitter:`
tags and JSON-LD for `/`, `/n/:value`, `/t/:tag` and `/p/:id`, and marks
everything else `noindex` — `/search`, `/random`, `/new`, `/p/:id/edit` and the
`*` route, which answers 200 with "Nothing here" and would otherwise be indexed
as a copy of the front page. Two consequences for work in here:

- **`index.html`'s `<title>` and `<meta name="description">` are rewritten by
  regex.** Reorder an attribute on either, add a second `<title>`, or hardcode
  an `og:` tag beside them and the substitution silently no-ops or duplicates.
  They are also read back out as the site's own title and blurb, so they stay
  the one place those words are written.
- **`public/og.png` is the share card, and it is the only asset in this repo.**
  Vite copies `public/` into `dist/` untouched, which is the whole reason it
  exists here rather than as a route in the API. `main.py`'s `OG_CARD` points
  every page at it by name, so renaming or resizing the file breaks the card on
  every share and nothing in this app would notice —
  `test_the_share_card_is_a_real_png` in the backend suite holds it at
  1200×630. It is drawn in this app's own tokens (`--bg`, `--accent`) and the
  numeral is `.hero .num`'s treatment, so a palette change here can leave it
  behind: it is a flat PNG and cannot follow a theme, let alone dark mode.
- **A new route is `noindex` until somebody says otherwise**, which is the safe
  way round. If a route added here deserves to be in a search result, it needs a
  branch in `_index()` — adding the `<Route>` alone is not enough.
- **`SiteTitle` in `App.tsx` is the one thing in here that touches the head, and
  it only ever puts it back.** A client-side navigation fetches no document, so
  the tab kept the last server-written title — "book — 17 entries" while you
  read `/p/1`, and a bookmark taken there saved that name. It restores
  `SITE_TITLE` and stops. Not the *page's* title: building that here is a second
  copy of four format strings that live in `main.py`, with nothing to notice the
  drift. `SITE_TITLE` is a hand-copy of `index.html`'s `<title>` and
  `test_the_site_has_one_name` compares them. A `useRef` keeps the first render
  out of it, or the title the server just wrote is thrown away on mount.

`vite.config.ts`'s proxy is a development convenience only — in production there
is one origin and nothing to proxy.
