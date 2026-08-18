import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import PostCard from '../components/PostCard'
import { useAsync } from '../useAsync'

type Mode = 'number' | 'tag' | 'search'

/** One list of posts, three ways in: a number, a tag, or a search. */
export default function Browse({ mode }: { mode: Mode }) {
  const { value = '', tag = '' } = useParams()
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''

  const posts = useAsync(
    () =>
      api.posts(
        mode === 'number'
          ? { value, sort: 'number' }
          : mode === 'tag'
            ? { tag, sort: 'number' }
            : { q, sort: 'number' },
      ),
    [mode, value, tag, q],
  )

  const n = posts.data?.length ?? 0
  const count = `${n} ${n === 1 ? 'entry' : 'entries'}`

  return (
    <>
      {mode === 'number' ? (
        <div className="hero">
          <div className="num">{value}</div>
          <h1>{count}</h1>
          <Link className="btn" to={`/new?value=${encodeURIComponent(value)}`}>
            + Add another meaning
          </Link>
        </div>
      ) : (
        <div className="hero">
          <h1>
            {mode === 'tag' ? (
              <>
                Tagged <span className="tag">{tag}</span>
              </>
            ) : (
              <>Search: “{q}”</>
            )}
          </h1>
          <span style={{ color: 'var(--muted)' }}>{count}</span>
        </div>
      )}

      {posts.err && <p className="err">{posts.err}</p>}
      {posts.loading && <p className="empty">Loading…</p>}

      {posts.data?.map((p) => (
        <PostCard key={p.id} post={p} showNumber={mode !== 'number'} />
      ))}

      {!posts.loading && n === 0 && (
        <p className="empty">
          No entries yet.{' '}
          <Link to={mode === 'number' ? `/new?value=${encodeURIComponent(value)}` : '/new'}>
            Add one.
          </Link>
        </p>
      )}
    </>
  )
}
