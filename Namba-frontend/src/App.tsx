import { useEffect, useState } from 'react'
import {
  BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useSearchParams,
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
      <p className="empty">
        Couldn’t pick one — {got.err}. <Link to="/">Back to the index.</Link>
      </p>
    )
  if (!got.loading && !hit)
    return (
      <p className="empty">
        Nothing to pick from yet. <Link to="/new">Add the first one.</Link>
      </p>
    )
  return <p className="empty">Loading…</p>
}

/* one path rather than 🎲, which arrives in colour and in whichever font the
   OS keeps its emoji in -- neither of which is this page. Inherits
   currentColor, so it greens on hover with the label beside it. */
const DIE = (
  <svg className="die" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1.7" y="1.7" width="12.6" height="12.6" rx="3" fill="none"
          stroke="currentColor" strokeWidth="1.3" />
    <circle cx="5.1" cy="5.1" r="0.95" fill="currentColor" />
    <circle cx="8" cy="8" r="0.95" fill="currentColor" />
    <circle cx="10.9" cy="10.9" r="0.95" fill="currentColor" />
  </svg>
)

function Header({ lang, onLang }: { lang: string; onLang: (v: string) => void }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const langs = useAsync(() => api.languages(), [])
  /* the toggle is a link, not state: the view survives a refresh and can be
     sent to someone. Pressing it while it is on goes back to the index. */
  const feed = pathname === '/' && params.get('view') === 'feed'

  return (
    <header className="top">
      <Link to="/" className="logo-block">
        <span className="logo">
          Na<span>mb</span>a
        </span>
        <span className="logo-sub">An open wiki of numbers</span>
      </Link>
      <div className="tagline">
        Every number means something to someone. Add what it means to you.
      </div>
      <div className="acts">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault()
            const q = new FormData(e.currentTarget).get('q') as string
            nav(`/search?q=${encodeURIComponent(q.trim())}`)
          }}
        >
          <span className="slash">/</span>
          <input
            type="search"
            name="q"
            placeholder="Search numbers…"
            defaultValue={params.get('q') ?? ''}
          />
        </form>
        {/* the options come from the wiki, not a list in here: the labels are
            free-form, so a fixed one would offer "Japanese" to a wiki that
            says "日本語". The count is how much of it you will actually read
            in that language -- everything else falls back to as-written. */}
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
        {/* "Recent", not "Feed": the label is a promise about the order, and
            this one is last-touched. The view is still the feed -- ?view=feed
            names the shape, a card list rather than the index. */}
        <Link className={`btn ${feed ? 'on' : ''}`} to={feed ? '/' : '/?view=feed'}>
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
    </header>
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
        <Header lang={lang} onLang={pickLang} />
        <Routes>
          <Route path="/" element={<Home lang={lang} />} />
          <Route path="/n/:value" element={<Browse mode="number" lang={lang} />} />
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
      </div>
    </BrowserRouter>
  )
}
