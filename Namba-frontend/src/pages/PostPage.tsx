import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmtDate, nickname, numberPath, type Post, type Revision } from '../api'
import PostCard, { Like } from '../components/PostCard'
import { useAsync } from '../useAsync'

export default function PostPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [revBump, setRevBump] = useState(0)
  const loaded = useAsync(() => api.post(id), [id])
  const revs = useAsync(() => api.revisions(id), [id, revBump])
  const [edited, setEdited] = useState<Post | null>(null)
  const [err, setErr] = useState('')

  const post = edited ?? loaded.data
  if (loaded.err) return <p className="err">{loaded.err}</p>
  if (!post) return <p className="empty">Loading…</p>

  async function run(fn: () => Promise<Post>) {
    setErr('')
    try {
      setEdited(await fn())
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function restore(rev: Revision) {
    await run(() => api.restore(post!.id, rev.id, nickname.get() || 'anonymous'))
    setRevBump((n) => n + 1) // a restore is an edit, so it adds a revision of its own
  }

  async function remove() {
    if (!confirm('Delete this entry? The previous version stays in its history.')) return
    try {
      await api.remove(post!.id)
      nav(numberPath(post!.value))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div className="detail-layout">
      <article className="detail">
        <div className="hero">
          <Link className="num" to={numberPath(post.value)}>
            {post.value}
          </Link>
          <h1>{post.title}</h1>
        </div>

        <div className="meta">
          {post.tags.map((t) => (
            <Link key={t} className="tag" to={`/t/${t}`}>
              {t}
            </Link>
          ))}
          <span>written by {post.author}</span>
          <span>{fmtDate(post.created_at)}</span>
          {post.updated_at !== post.created_at && (
            <span>
              · last edited {fmtDate(post.updated_at)}
              {post.edited_by && ` by ${post.edited_by}`}
            </span>
          )}
          <Like post={post} />
        </div>

        {post.image && <img className="full" src={post.image} alt={post.title} />}
        {post.body && <div className="body">{post.body}</div>}

        {err && <p className="err">{err}</p>}

        <div className="actions">
          <Link className="btn primary" to={`/p/${post.id}/edit`}>
            Edit this entry
          </Link>
          <button className="btn" onClick={remove}>
            Delete
          </button>
        </div>
        <p className="quiet">
          Anyone can edit — no account needed. Every version is kept, so nothing is
          lost if someone gets it wrong.
        </p>

        <h4 className="section">Related entries</h4>
        {post.related?.length ? (
          post.related.map((r) => (
            <div key={r.id} className="linked">
              <PostCard post={r} />
              <button className="btn small" onClick={() => run(() => api.unlink(post.id, r.id))}>
                Unlink
              </button>
            </div>
          ))
        ) : (
          <p className="empty" style={{ padding: '12px 0' }}>
            Nothing linked yet.
          </p>
        )}

        <LinkFinder post={post} onLinked={setEdited} />
      </article>

      <aside className="side">
        <h4 className="section">Edit history</h4>
        <ol className="revs">
          <li className="rev now">
            <b>{post.title}</b>
            <span>
              current · {post.edited_by ? `edited by ${post.edited_by}` : `by ${post.author}`}
            </span>
          </li>
          {revs.data?.map((r) => (
            <li className="rev" key={r.id}>
              <b>{r.snapshot.title}</b>
              <span>
                replaced by {r.author} · {fmtDate(r.at)}
              </span>
              <button className="btn small" onClick={() => restore(r)}>
                Restore
              </button>
            </li>
          ))}
        </ol>
        {!revs.loading && !revs.data?.length && (
          <p className="quiet">No edits yet — as first written.</p>
        )}
      </aside>
    </div>
  )
}

/** Search the wiki and attach another entry to this one. */
function LinkFinder({ post, onLinked }: { post: Post; onLinked: (p: Post) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Post[] | null>(null)
  const [err, setErr] = useState('')

  async function search(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      const found = await api.posts({ q, limit: 8 })
      setHits(found.filter((p) => p.id !== post.id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <>
      <h4 className="section">Link another entry</h4>
      <form onSubmit={search} className="inline-form">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Back to the Future"
        />
        <button className="btn">Search</button>
      </form>
      {err && <p className="err">{err}</p>}
      {hits?.map((h) => (
        <div key={h.id} className="card">
          <span className="num">{h.value}</span>
          <div className="main">
            <h3>{h.title}</h3>
          </div>
          <button
            className="btn small"
            onClick={async () => {
              onLinked(await api.link(post.id, h.id))
              const rest = hits.filter((x) => x.id !== h.id)
              setHits(rest.length ? rest : null) // not "no matches" -- none left
            }}
          >
            Link
          </button>
        </div>
      ))}
      {hits?.length === 0 && <p className="empty">No matches.</p>}
    </>
  )
}
