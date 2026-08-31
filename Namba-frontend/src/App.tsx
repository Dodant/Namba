import { useEffect, useRef, useState } from 'react'
import {
  BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useNavigationType,
  useSearchParams,
} from 'react-router-dom'
import { api, displayLang } from './api'
import Home from './pages/Home'
import Browse from './pages/Browse'
import PostPage from './pages/PostPage'
import PostForm from './pages/PostForm'
import { useAsync } from './useAsync'

/* A wiki's "show me anything". A route rather than an onClick, so it can be
   linked, bookmarked and opened in a new tab -- and so the wait and the
   failure have somewhere to show, which a button in the header does not.
   Replaces rather than pushes: otherwise Back from the entry lands here and
   rolls again, and there is no way out of the loop. */
function Random() {
  const nav = useNavigate()
  const got = useAsync(() => api.posts({ sort: 'random', limit: 1 }), [])
  const hit = got.data?.[0]

  useEffect(() => {
    if (hit) nav(`/p/${hit.id}`, { replace: true })
  }, [hit, nav])

  if (got.err)
    return (
      <p className="empty" role="alert">
        Couldn’t pick one — {got.err}. <Link to="/">Back to the index.</Link>
      </p>
    )
  if (!got.loading && !hit)
    return (
      <p className="empty" role="status">
        Nothing to pick from yet. <Link to="/new">Add the first one.</Link>
      </p>
    )
  return (
    <p className="empty" role="status">
      Loading…
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

/* A clock, because Recent names an order and not a thing: this list is
   last-touched first. Drawn to the die's spec -- the same 16px box, the same
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

/* Nothing puts the reader at the top of a new page on its own: the router
   leaves the scroll where it was, and until the lists stopped emptying on
   every load it was reset by accident -- the page collapsed to a "Loading…"
   line, and there was nowhere to be scrolled to. Now that they hold their
   content, this has to say so.

   Search too, not just the path: every param here swaps one list for another
   (a format, a tag, a query, the feed), and none of them is a position in the
   list you are already reading.

   POP is left alone. That is Back, where the reader had a place on the page
   and it is not ours to throw away -- the browser restores what it can, which
   on a list that reloads from empty is often nothing. Putting that right
   means remembering an offset per history entry, which is a good deal more
   machinery than this. */
function ScrollTop() {
  const { pathname, search } = useLocation()
  const how = useNavigationType()
  useEffect(() => {
    if (how !== 'POP') window.scrollTo(0, 0)
  }, [pathname, search, how])
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
  const { pathname, search } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.title = SITE_TITLE
  }, [pathname, search])
  return null
}

/* index.html's <title>, which is also what main.py reads back out of it as the
   site's own name. Here so a navigation can put it back; see SiteTitle. */
const SITE_TITLE = 'Namba — a wiki of numbers'

/* One copy, because it is drawn as two different elements below and a second
   copy is a wordmark that can be spelled two ways. */
const WORDMARK = (
  <>
    Na<span>mb</span>a
  </>
)

function Header({ lang, onLang }: { lang: string; onLang: (v: string) => void }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const langs = useAsync(() => api.languages(), [])
  const box = useRef<HTMLInputElement>(null)

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
        <span className="logo-sub">An open wiki about numbers</span>
      </Link>
      <div className="acts">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault()
            const q = (new FormData(e.currentTarget).get('q') as string).trim()
            /* an empty box is not a search for nothing: the API drops an empty
               q and hands back the whole wiki, which arrived under the
               heading Search: "" and read as a bug. */
            if (!q) return
            nav(`/search?q=${encodeURIComponent(q)}`)
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
          <input
            ref={box}
            type="search"
            name="q"
            aria-label="Search the wiki by number, title or text"
            placeholder="Search the wiki…"
            defaultValue={params.get('q') ?? ''}
          />
        </form>
        {/* the options come from the wiki, not a list in here: the labels are
            free-form, so a fixed one would offer "Japanese" to a wiki that
            says "日本語". The count is how much of it you will actually read
            in that language -- everything else falls back to as-written.
            Absent until something is translated, rather than a menu of one:
            with nothing written in another language the only entries are
            Original and the stored default reading "English · 0", they do
            the same nothing, and picking Original drops the other one for
            good. It comes back with the first translation. */}
        {!!langs.data?.length && (
          <div className="select lang-pick">
            <select
              value={lang}
              aria-label="Show lists in"
              onChange={(e) => onLang(e.target.value)}
            >
              <option value="">Original</option>
              {(langs.data ?? []).map((l) => (
                <option key={l.lang} value={l.lang}>
                  {l.lang} · {l.count}
                </option>
              ))}
              {/* the stored choice may be a language nobody has written yet --
                  keep it selectable rather than showing an empty box */}
              {lang && !(langs.data ?? []).some((l) => l.lang === lang) && (
                <option value={lang}>{lang} · 0</option>
              )}
            </select>
          </div>
        )}
        {/* The three that act, in a group of their own so the phone layout is
            the same whether or not the language picker is there: the search
            takes a row, these take the row under it. Left to wrap on their
            own widths, the picker's arrival pushed "+ Add" onto a third row
            by itself. On a wide screen the wrapper is a flex row inside a
            flex row with the same gap, so it draws exactly as before. */}
        <div className="acts-main">
          {/* "Recent", not "Feed": the label is a promise about the order,
              and this one is last-touched. The view is still the feed --
              ?view=feed names the shape, a card list rather than the index. */}
          <Link
            className={`btn ${feed ? 'on' : ''}`}
            aria-current={feed ? 'page' : undefined}
            to={feed ? '/' : '/?view=feed'}
          >
            {CLOCK}
            Recent
          </Link>
          <Link className="btn" to="/random">
            {DIE}
            Random
          </Link>
          <Link className="btn primary" to="/new">
            + Add
          </Link>
        </div>
      </div>
    </header>
  )
}

/* Four things that belong on every page and nowhere else.

   Not five. The takedown path was going to live here until it turned out
   /api/posts/{id}/report and /delete-request both want an id -- you report an
   entry, not a wiki -- so that control belongs on the entry and there is no id
   down here to send it.

   Sentences rather than a row of policy pages. With no reader accounts there is
   nothing to disclose that does not fit in one, and a sentence carried by every
   page is read more than a page nobody clicks. */
function Footer() {
  return (
    <footer className="foot">
      <p>
        Everything written here is{' '}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a> — public
        domain. Take it, quote it, feed it to a machine; no permission and no credit
        needed. The byline stays anyway, because it says who got there first.
      </p>
      <p>
        No accounts and no addresses. A salted hash of yours is kept to slow a flood
        and to make a block mean something, and nothing else about you is stored.
      </p>
      <p>
        {/* Absolute, not a Link: FastAPI serves these, not the router. Both are
            in the dev proxy beside /api for the same reason. */}
        <a href="/docs">API</a> — open, no key.{' · '}
        <a href="https://github.com/MIIRAIII/Namba">Source</a>
      </p>
    </footer>
  )
}

export default function App() {
  /* Held here and handed down rather than read from localStorage in each page:
     the pages have to refetch when it changes, and only a value they render
     with does that. Four props is less machinery than a context for one
     string. */
  const [lang, setLang] = useState(displayLang.get)

  function pickLang(v: string) {
    displayLang.set(v)
    setLang(v)
  }

  return (
    <BrowserRouter>
      <div className="wrap">
        <ScrollTop />
        <SiteTitle />
        <Header lang={lang} onLang={pickLang} />
        <main>
          <Routes>
            <Route path="/" element={<Home lang={lang} />} />
            <Route path="/n/:value" element={<Browse mode="number" lang={lang} />} />
            <Route path="/a/:value" element={<Browse mode="abbr" lang={lang} />} />
            <Route path="/t/:tag" element={<Browse mode="tag" lang={lang} />} />
            <Route path="/search" element={<Browse mode="search" lang={lang} />} />
            <Route path="/random" element={<Random />} />
            <Route path="/p/:id" element={<PostPage />} />
            <Route path="/p/:id/edit" element={<PostForm />} />
            <Route path="/new" element={<PostForm />} />
            <Route
              path="*"
              element={
                <p className="empty">
                  Nothing here. <Link to="/">Back to the index.</Link>
                </p>
              }
            />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
