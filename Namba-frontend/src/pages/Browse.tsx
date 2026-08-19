import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, FORMAT_LABEL, showValue, tagLabel, type Post } from '../api'
import PostCard from '../components/PostCard'
import { useAsync } from '../useAsync'

type Mode = 'number' | 'tag' | 'search'

/* the hero counts people, not records, so it spells the number out -- a
   second numeral beside a 104px one is a fight nobody wins. Past twelve it
   goes back to digits, which is roughly where the words stop being shorter */
const COUNTS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
  'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
]

/* MIXED has no sort key -- "9¾" sorts by its string -- so it gets the format
   and nothing else rather than "sorts at null" */
function kicker(p: Post) {
  const label = FORMAT_LABEL[p.format]
  return p.sort_key === null ? label : `${label} · sorts at ${p.sort_key}`
}

/** One list of posts, three ways in: a number, a tag, or a search. */
export default function Browse({ mode, lang }: { mode: Mode; lang: string }) {
  const { value = '', tag = '' } = useParams()
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''

  const posts = useAsync(
    () =>
      api.posts(
        mode === 'number'
          ? { value, sort: 'number', lang }
          : mode === 'tag'
            ? { tag, sort: 'number', lang }
            : { q, sort: 'number', lang },
      ),
    [mode, value, tag, q, lang],
  )

  const n = posts.data?.length ?? 0
  const count = `${n} ${n === 1 ? 'entry' : 'entries'}`

  return (
    <>
      {mode === 'number' ? (
        <div className="hero">
          {/* same rule as the index row: this page is one number shared by
              several entries, so separators need all of them to agree */}
          <div className="num">
            {showValue(value, !!posts.data?.length && posts.data.every((p) => p.grouped))}
          </div>
          {/* stays even when empty: it is the flex spacer that keeps the add
              button on the right. At zero there is nothing to describe and no
              format to read it from, so the empty state below says the rest */}
          <div className="hero-said">
            {posts.data?.length ? (
              <>
                <span className="kicker">{kicker(posts.data[0])}</span>
                <h1>
                  {COUNTS[n] ?? n} {n === 1 ? 'person has' : 'people have'} written
                  about this number.
                </h1>
              </>
            ) : null}
          </div>
          <Link className="btn outline" to={`/new?value=${encodeURIComponent(value)}`}>
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
