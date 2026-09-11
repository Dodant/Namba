import {
  Component, useDeferredValue, useEffect, useLayoutEffect, useRef, useState,
  type ReactNode,
} from 'react'
import {
  BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useNavigationType,
  useSearchParams,
} from 'react-router-dom'
import { api, contentLanguage } from './api'
import { canonicalNumber, showValue } from './format'
import Home from './pages/Home'
import Browse from './pages/Browse'
import PostPage from './pages/PostPage'
import PostForm from './pages/PostForm'
import Guide from './pages/Guide'
import { useAsync } from './useAsync'
import { UI_LOCALES, type UiLocale } from './locales'
import { UiProvider, useUi } from './uiLocale'

/* A wiki's "show me anything". A route rather than an onClick, so it can be
   linked, bookmarked and opened in a new tab -- and so the wait and the
   failure have somewhere to show, which a button in the header does not.
   Replaces rather than pushes: otherwise Back from the entry lands here and
   rolls again, and there is no way out of the loop. */
function Random() {
  const { m } = useUi()
  const nav = useNavigate()
  const got = useAsync(() => api.posts({ sort: 'random', limit: 1 }), [])
  const hit = got.data?.[0]

  useEffect(() => {
    if (hit) nav(`/p/${hit.id}`, { replace: true })
  }, [hit, nav])

  if (got.err)
    return (
      <p className="empty" role="alert">
        {m.random.failed(got.err)} <Link to="/">{m.common.backToIndex}</Link>
      </p>
    )
  if (!got.loading && !hit)
    return (
      <p className="empty" role="status">
        {m.random.empty} <Link to="/new">{m.common.addFirst}</Link>
      </p>
    )
  return (
    <p className="empty" role="status">
      {m.common.loading}
    </p>
  )
}

/* one path rather than 🎲, which arrives in colour and in whichever font the
   OS keeps its emoji in -- neither of which is this page. Inherits
   currentColor, so it greens on hover with the label beside it. */
const DIE = (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1.7" y="1.7" width="12.6" height="12.6" rx="3" fill="none"
          stroke="currentColor" strokeWidth="1.3" />
    <circle cx="5.1" cy="5.1" r="0.95" fill="currentColor" />
    <circle cx="8" cy="8" r="0.95" fill="currentColor" />
    <circle cx="10.9" cy="10.9" r="0.95" fill="currentColor" />
  </svg>
)

/* A clock because Recent opens the last-touched-first view. Drawn to the
   die's spec -- the same 16px box, the same
   1.3 stroke, no fill, currentColor -- so the two pills side by side read as
   one set rather than as two icons that happened to turn up together. Hands
   at twelve and four, different lengths: at 14px a clock face only reads as
   one if the two hands can be told apart. */
const CLOCK = (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.35" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 4.4v3.75l2.5 1.45" fill="none" stroke="currentColor"
          strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* Plus for Add, to the same box. As an icon it is what is left of the
   button once its label goes under 900. Its arms
   reach 2.75 to 13.25, a little inside the die's 1.7 to 14.3: a plus has no
   outline to mark its extent, so drawn to the same edges it reads bigger
   than the shapes beside it, and drawn to 9 units it read smaller. And a
   1.5 stroke rather than the set's 1.3, because this one is light on the
   filled button, where the same line looks thinner than ink on paper. */
const PLUS = (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2.75v10.5M2.75 8h10.5" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

/* Nothing puts the reader at the top of a new page on its own: the router
   leaves the scroll where it was, and the lists keep their content while the
   next loads (`keep` in useAsync), so the page never collapses to a line that
   would reset it by accident. This has to say so.

   Search too, not just the path: every param here swaps one list for another
   (a format, a tag, a query, the feed), and none of them is a position in the
   list you are already reading.

   POP is left alone. That is Back, where the reader had a place on the page
   and it is not ours to throw away -- the browser restores what it can, which
   on a list that reloads from empty is often nothing. Putting that right
   means remembering an offset per history entry, which is a good deal more
   machinery than this. */
function ScrollTop() {
  const { pathname, search, hash } = useLocation()
  const how = useNavigationType()
  useEffect(() => {
    if (how !== 'POP' && !hash) window.scrollTo(0, 0)
  }, [pathname, search, hash, how])
  /* A fragment is a place in the page and the top is not it, which is why the
     effect above stands down for one.

     This one is here because the browser cannot do it alone. /guide#mining
     arrives as a document whose body is an empty <div id="root">: the element
     is looked for before React has drawn it, is not found, and nothing tries
     again -- so the reader lands wherever the page happened to reach as it
     grew. Measured on /guide#works, that was 1931px past the heading.

     A layout effect, so the scroll happens after React paints and before the
     browser does, and the first frame is already in the right place. Keyed on
     the hash, which covers both the load and a later in-page link and needs no
     deps rule turned off to say so.

     POP is not exempt here, unlike above, and cannot be: a document opened at
     a fragment *is* a POP as far as the router is concerned, and that is the
     case this exists for. The price is that Back to an address carrying a
     fragment returns to the fragment rather than to where you had scrolled --
     which is what the address says, so it is a trade rather than a defeat. */
  useLayoutEffect(() => {
    if (!hash) return
    const target = () => document.getElementById(hash.slice(1))
    target()?.scrollIntoView()
    /* ...and once more when the fonts land. Newsreader and IBM Plex arrive
       from Google with display=swap, so a cold visit paints in a fallback
       face, scrolls to the right place, and is then pushed off it as every
       line above re-measures in the real one. Measured near the foot of
       /guide: 310px, which is most of a section.

       Twice rather than only after the fonts, because on a repeat visit they
       are already there and waiting on the promise would paint at the top of
       the page first and jump. And only if nothing has moved since -- if the
       reader started scrolling in the meantime, that is now their position and
       not ours to take back. */
    const was = window.scrollY
    document.fonts?.ready.then(() => {
      if (window.scrollY === was) target()?.scrollIntoView()
    })
  }, [hash])
  return null
}

/* The one thing in here that touches the head, and it only ever puts it back.

   main.py writes the real title per request -- "7 — 4 entries · Namba" -- and
   it is right on the load, the reload, the share and the crawl. A client-side
   navigation does not fetch a document, so without this the tab still said
   "book — 17 entries" while you read /p/1, and a bookmark taken there saved
   that name. Wrong is worse than plain, so a navigation restores the site's
   own title and stops.

   Not the *page's* title, deliberately: building that here means a second copy
   of four format strings that live in main.py, with nothing to notice when the
   two drift. This app still writes no metadata -- it has one line that undoes
   a value it did not set, on a document it did not build. If the tab is ever
   to say more than this, the answer is one title per route from the server,
   not a hand-copy over here.

   The ref is what keeps the first render out of it: the title the server just
   wrote is the correct one, and resetting it on mount would throw it away
   before anybody read the tab. */
function SiteTitle() {
  const { locale, m } = useUi()
  const { pathname, search } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.title = locale === 'en' ? SITE_TITLE : m.siteTitle
  }, [pathname, search, locale, m.siteTitle])
  return null
}

/* The server reads the same English default from index.html. Localized titles
   are client-side UI state; this constant remains the canonical site name. */
const SITE_TITLE = 'Namba — a wiki of numbers'

/* One copy, because it is drawn as two different elements below and a second
   copy is a wordmark that can be spelled two ways. */
const WORDMARK = (
  <>
    Na<span>mb</span>a
  </>
)

function highlightMatches(text: string, query: string): ReactNode {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))]
  if (!terms.length) return text
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return text.split(new RegExp(`(${escaped.join('|')})`, 'gi')).map((part, index) =>
    index % 2 ? <mark key={index}>{part}</mark> : part,
  )
}

function Header({ lang }: { lang: string }) {
  const { locale, m } = useUi()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const box = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  /* Whether the reader is still in the search box. Results alone are not
     enough to draw the list: they outlive the reader's interest in them, so
     without this a query typed and then abandoned left a panel hanging over
     the page until the next navigation. */
  const [searching, setSearching] = useState(false)
  /* Rendering suggestion results can wait a moment; typing itself cannot. */
  const deferredQuery = useDeferredValue(query.trim())
  const suggestionQuery = canonicalNumber(deferredQuery, locale).value
  const suggestions = useAsync(
    () => suggestionQuery.length >= 2
      ? api.posts({ q: suggestionQuery, sort: 'relevance', limit: 5, lang })
      : Promise.resolve([]),
    [suggestionQuery, lang],
  )

  useEffect(() => setQuery(params.get('q') ?? ''), [params])
  useEffect(() => setActiveSuggestion(-1), [suggestionQuery])

  const suggestionPosts = suggestions.data ?? []
  const hasSuggestions =
    searching && suggestionQuery.length >= 2 && suggestionPosts.length > 0

  function openSearch() {
    const q = query.trim()
    /* an empty box is not a search for nothing: the API drops an empty q and
       hands back the whole wiki, which arrived under Search and read as a bug. */
    if (!q) return
    /* The shortcut has been taken: the page about to draw is the whole answer,
       and the five-row version of it hanging over the top is the question
       asked twice. Closing here rather than on the navigation, because the
       focus never leaves the box -- there is no blur to hang it on. */
    setSearching(false)
    nav(`/search?q=${encodeURIComponent(canonicalNumber(q, locale).value)}`)
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasSuggestions) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveSuggestion((current) => (current + step + suggestionPosts.length) % suggestionPosts.length)
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault()
      const post = suggestionPosts[activeSuggestion]
      setQuery('')
      nav(`/p/${post.id}`)
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  /* the pill has always drawn a "/" and nothing has ever listened for one.
     Either the glyph goes or this does, and the glyph is the convention every
     wiki and forge uses, so it stays and gets its key. Ignored while a field
     has the focus -- a number value can be 11/22/63, and a slash in the
     Details box is a slash. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return
      e.preventDefault() // Firefox opens its own quick-find on this key
      box.current?.focus()
      box.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  /* the toggle is a link, not state: the view survives a refresh and can be
     sent to someone. Pressing it while it is on goes back to the index. */
  const feed = pathname === '/' && params.get('view') === 'feed'

  return (
    <header className="top">
      <Link to="/" className="logo-block">
        {/* The site's name is the front page's <h1>, and a <span> on every
            other page. The index has no heading of its own -- it opens on a
            row of format tabs and then straight into <h2> bands -- so without
            this the one page a search engine is most likely to land on had no
            h1 at all. Everywhere else the h1 belongs to the thing you came
            for: the entry, the number, the tag, the form. */}
        {pathname === '/' ? (
          <h1 className="logo">{WORDMARK}</h1>
        ) : (
          <span className="logo">{WORDMARK}</span>
        )}
        <span className="logo-sub">{m.tagline}</span>
      </Link>
      <div className="acts">
        {/* focusout, not the input's own blur: it bubbles, so this one
            handler covers the box, the options and the button under it.
            `relatedTarget` is where the focus went, and it is inside this
            wrapper for every move that is still part of searching -- a click
            on a suggestion focuses the link before the click lands, which is
            what would otherwise close the list out from under the pointer.
            Null means the page lost focus entirely, which is a leave. */}
        <div
          className="search-wrap"
          onFocus={() => setSearching(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setSearching(false)
          }}
        >
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault()
              openSearch()
            }}
          >
            <span className="slash">/</span>
          {/* Not "Search numbers". q goes at the value, the title, the body and
              every translation's title and body -- one LIKE clause in main.py
              -- so a box that says numbers is a box nobody types a word into,
              on a wiki where the words are the point.

              Short because it has to be: at (pointer: coarse) this input is
              172px of 16px mono, which is seventeen characters before the
              placeholder is cut. The enumeration goes in the label, which has
              no width to run out of. */}
            {/* The WAI-ARIA combobox pattern, because the arrow keys below
                move a selection and nothing else here says so: without the
                roles a screen reader announces a text box, and the list that
                Down opens, the option it lands on and the one it leaves are
                all silent. `aria-activedescendant` is what moves the reader's
                cursor without moving the focus out of the box being typed in
                -- which is the whole reason the pattern exists. */}
            <input
              ref={box}
              type="search"
              name="q"
              role="combobox"
              aria-label={m.header.searchLabel}
              aria-autocomplete="list"
              aria-controls="search-suggestions"
              aria-expanded={hasSuggestions}
              aria-activedescendant={
                activeSuggestion >= 0
                  ? `search-suggestion-${suggestionPosts[activeSuggestion].id}`
                  : undefined
              }
              placeholder={m.header.searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                // typing is asking again, and the box may still hold the
                // query that was just committed with Enter
                setSearching(true)
              }}
              onKeyDown={onSearchKeyDown}
            />
          </form>
          {hasSuggestions && (
            <div className="search-suggestions">
              {/* The listbox holds options and nothing else, which is why the
                  button below is outside it: "see all results" is not one of
                  the entries the arrow keys walk. The stylesheet reaches both
                  through `.search-suggestions`, a descendant selector, so this
                  wrapper costs no CSS. */}
              <div role="listbox" id="search-suggestions" aria-label={m.header.suggestions}>
                {suggestionPosts.map((post, index) => (
                  <Link
                    key={post.id}
                    id={`search-suggestion-${post.id}`}
                    role="option"
                    aria-selected={index === activeSuggestion}
                    to={`/p/${post.id}`}
                    className={index === activeSuggestion ? 'is-active' : undefined}
                    onClick={() => setQuery('')}
                  >
                    <span className="search-suggestion-value">
                      {highlightMatches(showValue(post.value, post.grouped, locale, post.format),
                                        deferredQuery)}
                    </span>
                    <span>{highlightMatches(post.title, deferredQuery)}</span>
                  </Link>
                ))}
              </div>
              <button
                type="button"
                className="search-all"
                onClick={openSearch}
              >
                {m.header.allResults}
              </button>
            </div>
          )}
        </div>
        {/* The three that act, in a group of their own. Left to wrap on
            their own widths they broke wherever the search box happened to
            end; grouped, they stay one set. Under 900 the labels are clipped
            and the icons stay, so the group keeps the search box's row
            instead of taking one of its own -- .lbl is what the CSS hides,
            and the name is still in the link for a screen reader. On a wide
            screen the wrapper is a flex row inside a flex row with the same
            gap, so it draws exactly as before. */}
        <div className="acts-main">
          {/* Recent is shared product vocabulary in every locale and names
              the last-touched ordering; ?view=feed still names the shape, a
              card list rather than the index. */}
          <Link
            className={`btn ${feed ? 'on' : ''}`}
            aria-current={feed ? 'page' : undefined}
            to={feed ? '/' : '/?view=feed'}
          >
            {CLOCK}
            <span className="lbl">{m.header.recent}</span>
          </Link>
          <Link className="btn" to="/random">
            {DIE}
            <span className="lbl">{m.header.random}</span>
          </Link>
          <Link className="btn primary" to="/new">
            {PLUS}
            <span className="lbl">{m.header.add}</span>
          </Link>
        </div>
      </div>
    </header>
  )
}

/* Up, drawn to the die and the clock's spec -- the same 16px box, 1.3 stroke,
   no fill, currentColor. */
const UP = (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 13.1V3.7M3.9 7.8 8 3.6l4.1 4.2" fill="none" stroke="currentColor"
          strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* The way back from the bottom of a long one -- /guide is twenty-two headings,
   an index band runs to a few hundred rows. Appears a screenful down, which is
   the point where the header has been gone long enough to be missed, rather
   than at a pixel count that means something different on a phone and a
   monitor.

   scrollTo carries its behaviour rather than html { scroll-behavior: smooth },
   which would have been fewer lines and would also have taken ScrollTop's
   scrollIntoView with it: a fragment load would animate down the page, and the
   scrollY guard in there -- the one that stands down if the reader has started
   scrolling -- would be reading a position mid-flight. Reduced motion is asked
   here for the same reason; the CSS rule that answers it only reaches
   transitions.

   Hidden with visibility rather than unmounted, so it fades on both edges and
   cannot be tabbed to or clicked while it is invisible. */
function ToTop() {
  const { m } = useUi()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      /* not .btn.on -- that class is "this is the view you are in" and
         arrives painted accent; this one is only whether the control is
         there at all */
      className={`btn to-top ${show ? 'shown' : ''}`}
      aria-label={m.header.backToTop}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
    >
      {UP}
    </button>
  )
}

/* Five things that belong on every page and nowhere else.

   Not five. The takedown path was going to live here until it turned out
   /api/posts/{id}/report and /delete-request both want an id -- you report an
   entry, not a wiki -- so that control belongs on the entry and there is no id
   down here to send it.

   Sentences rather than a row of policy pages. With no reader accounts there is
   nothing to disclose that does not fit in one, and a sentence carried by every
   page is read more than a page nobody clicks. */
function Footer({ lang, onLang }: { lang: string; onLang: (v: string) => void }) {
  const { locale, setLocale, m } = useUi()
  const langs = useAsync(() => api.languages(), [])
  return (
    <footer className="foot">
      <p>
        {m.footer.cc0Before}{' '}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>
        {m.footer.cc0After}
      </p>
      <p>
        {m.footer.privacy}
      </p>
      <p>
        {/* Absolute, not a Link: FastAPI serves these, not the router. Both are
            in the dev proxy beside /api for the same reason. */}
        {/* Before the API and the source: this is the one of the three a
            reader who has not written anything yet has a use for. A Link and
            not an <a> -- unlike its two neighbours it is a route in this
            bundle, and a full document load here would throw the app away. */}
        <Link to="/guide">{m.footer.guidelines}</Link>{' · '}
        <a href="/docs">API</a> — {m.footer.apiOpen}{' · '}
        <a href="https://github.com/Dodant/Namba">{m.footer.source}</a>
      </p>
      {/* Two independent choices. Interface changes Namba's own controls and
          dates; entry text asks the API for a preferred translation and falls
          back to what was written. The latter's options still come from the
          translations in use, while the interface locales are versions this
          bundle can actually render end to end. */}
      <div className="locale-picks">
        <label className="locale-pick">
          <span>{m.footer.interfaceLanguage}</span>
          <span className="select lang-pick">
            <select
              value={locale}
              aria-label={m.footer.interfaceAria}
              onChange={(e) => setLocale(e.target.value as UiLocale)}
            >
              {UI_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="locale-pick">
          <span>{m.footer.contentLanguage}</span>
          <span className="select lang-pick">
          <select
            value={lang}
            aria-label={m.footer.contentAria}
            onChange={(e) => onLang(e.target.value)}
          >
            <option value="">{m.footer.asWritten}</option>
            {(langs.data ?? []).map((l) => (
              <option key={l.lang} value={l.lang}>
                {m.footer.translatedCount(l.lang, l.count)}
              </option>
            ))}
            {/* the stored choice may be a language nobody has written yet --
                keep it selectable rather than showing an empty box */}
            {lang && !(langs.data ?? []).some((l) => l.lang === lang) && (
              <option value={lang}>{m.footer.translatedCount(lang, 0)}</option>
            )}
          </select>
          </span>
        </label>
      </div>
    </footer>
  )
}

function Wiki() {
  /* Content preference is held here because list pages refetch when it changes.
     Interface locale lives in UiProvider and never enters an API request. */
  const [lang, setLang] = useState(contentLanguage.get)

  function pickLang(v: string) {
    contentLanguage.set(v)
    setLang(v)
  }

  return (
    <BrowserRouter>
      <div className="wrap">
        <ScrollTop />
        <SiteTitle />
        <Header lang={lang} />
        <main>
          <Guarded>
            <Routes>
              <Route path="/" element={<Home lang={lang} />} />
              <Route path="/n/:value" element={<Browse mode="number" lang={lang} />} />
              <Route path="/a/:value" element={<Browse mode="abbr" lang={lang} />} />
              <Route path="/c/:value" element={<Browse mode="calendar" lang={lang} />} />
              <Route path="/t/:tag" element={<Browse mode="tag" lang={lang} />} />
              <Route path="/search" element={<Browse mode="search" lang={lang} />} />
              <Route path="/random" element={<Random />} />
              <Route path="/p/:id" element={<PostPage contentLang={lang} />} />
              <Route path="/p/:id/edit" element={<PostForm />} />
              <Route path="/new" element={<PostForm />} />
              <Route path="/guide" element={<Guide />} />
              <Route
                path="*"
                element={
                  <p className="empty">
                    <NotFound />
                  </p>
                }
              />
            </Routes>
          </Guarded>
        </main>
        <Footer lang={lang} onLang={pickLang} />
        <ToTop />
      </div>
    </BrowserRouter>
  )
}

function NotFound() {
  const { m } = useUi()
  return <>{m.notFound} <Link to="/">{m.common.backToIndex}</Link></>
}

/* The other way a page fails: not "there is nothing here" but "this threw".

   react-markdown, remark-gfm and remark-breaks run on a body a stranger
   typed, and with no accounts there is nobody to ask what they meant. Without
   a boundary anywhere in the app, one throw in there unmounted the whole tree
   and left the reader a white document -- no header, no footer, no way out but
   the back button.

   Around <Routes> and not around .wrap, which is the whole design: the header,
   the search box and the footer are drawn by components that did not throw, so
   they stay, and the reader can leave. What breaks is the page.

   The fallback is a function component so it can read the locale, which a
   class cannot; the class holds nothing but the latch. Reporting the throw to
   the server is deliberately not here -- that would be a new public write
   route on an open API with no key, which is a larger decision than this. The
   50 that reaches `events` (main.py's handler) covers the server's half. */
class Latch extends Component<{ children: ReactNode }, { broke: boolean }> {
  state = { broke: false }
  static getDerivedStateFromError() {
    return { broke: true }
  }
  render() {
    return this.state.broke ? <Broke /> : this.props.children
  }
}

function Broke() {
  const { m } = useUi()
  return (
    <p className="empty" role="alert">
      {m.broke} <Link to="/">{m.common.backToIndex}</Link>
    </p>
  )
}

/* A boundary latches: once it has caught, it renders the fallback until it is
   remounted -- so without this, "Back to the index" changes the address and
   leaves the same apology on screen, and the site looks broken for good.

   ponytail: keyed on the path, which remounts the page subtree on every
   navigation and not only after a throw. It costs nothing here because every
   route refetches on its own params anyway; if a page ever needs to keep state
   across a navigation, this becomes a reset on the broken branch only. */
function Guarded({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Latch key={pathname}>{children}</Latch>
}

export default function App() {
  return (
    <UiProvider>
      <Wiki />
    </UiProvider>
  )
}
