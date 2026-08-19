import {
  BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useSearchParams,
} from 'react-router-dom'
import Home from './pages/Home'
import Browse from './pages/Browse'
import PostPage from './pages/PostPage'
import PostForm from './pages/PostForm'

function Header() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
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
        <Link className={`btn ${feed ? 'on' : ''}`} to={feed ? '/' : '/?view=feed'}>
          Feed
        </Link>
        <Link className="btn primary" to="/new">
          + Add
        </Link>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="wrap">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/n/:value" element={<Browse mode="number" />} />
          <Route path="/t/:tag" element={<Browse mode="tag" />} />
          <Route path="/search" element={<Browse mode="search" />} />
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
