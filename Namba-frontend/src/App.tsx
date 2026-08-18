import { BrowserRouter, Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import Home from './pages/Home'
import Browse from './pages/Browse'
import PostPage from './pages/PostPage'
import PostForm from './pages/PostForm'

function Header() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  return (
    <header className="top">
      <Link to="/" className="logo">
        Na<span>mb</span>a
      </Link>
      <div className="tagline">
        Every number means something to someone. Add what it means to you — no account needed.
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const q = new FormData(e.currentTarget).get('q') as string
          nav(`/search?q=${encodeURIComponent(q.trim())}`)
        }}
      >
        <input
          type="search"
          name="q"
          placeholder="Search numbers…"
          defaultValue={params.get('q') ?? ''}
        />
        <Link className="btn primary" to="/new">
          + Add
        </Link>
      </form>
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
          <Route path="*" element={<p className="empty">Nothing here. 404.</p>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
