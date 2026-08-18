import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, tagLabel } from '../api'
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
                Tagged <span className="tag">{tagLabel(tag)}</span>
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
        // an empty search is not an empty wiki, and saying "no entries yet" on
        // all three reads as though the place were deserted
        <p className="empty">
          {mode === 'number' ? (
            <>
              Nothing filed under {value} yet.{' '}
              <Link to={`/new?value=${encodeURIComponent(value)}`}>
                Give it a meaning.
              </Link>
            </>
          ) : mode === 'tag' ? (
            <>
              Nothing tagged {tagLabel(tag)} yet. <Link to="/new">Add the first one.</Link>
            </>
          ) : (
            <>
              No matches for “{q}”. Try another word, or{' '}
              <Link to="/new">add what it means.</Link>
            </>
          )}
        </p>
      )}
    </>
  )
}
