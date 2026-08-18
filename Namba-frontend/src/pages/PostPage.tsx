import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api, fmtDate, nickname, numberPath,
  type Post, type Revision, type Translation,
} from '../api'
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
  const [lang, setLang] = useState('')                       // '' is the entry itself
  const [form, setForm] = useState<Translation | 'new' | null>(null)

  const post = edited ?? loaded.data
  /* The entry is gone, but its snapshots are not -- revisions have no foreign
     key precisely so a delete stays undoable. Show them here, or the wiki keeps
     a recovery it never offers. */
  async function resurrect(rev: Revision) {
    try {
      await api.restore(Number(id), rev.id, nickname.get() || 'anonymous')
      location.reload() // this render came off a 404; start clean
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (loaded.err)
    return (
      <>
        <p className="empty">
          Couldn’t open this entry — {loaded.err}. <Link to="/">Back to the index.</Link>
        </p>
        {err && <p className="err">{err}</p>}
        {revs.data?.length ? (
          <>
            <h4 className="section">What it used to say</h4>
            <p className="quiet">
              Nothing here is lost. Restoring puts the entry back at this same
              address, so whatever linked to it still points at it.
            </p>
            <ol className="revs">
              {revs.data.map((r) => (
                <li className="rev" key={r.id}>
                  <b>{r.snapshot.title}</b>
                  <span>
                    {r.snapshot.value} · {byline(r)} · {fmtDate(r.at)}
                  </span>
                  <button className="btn small" onClick={() => resurrect(r)}>
                    Restore
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </>
    )
  if (!post) return <p className="empty">Loading…</p>

  // the tab in front. Both shapes carry title and body, which is all the page
  // reads off it -- the number, tags, image and links belong to the entry.
  const tr = post.translations?.find((t) => t.lang === lang) ?? null
  const shown = tr ?? post

  function showLang(l: string) {
    setLang(l)
    setForm(null)
  }

  async function removeTr(t: Translation) {
    if (!confirm(`Remove the ${t.lang} version? It stays in the entry's history.`)) return
    await run(() => api.untranslate(post!.id, t.id, nickname.get() || 'anonymous'))
    setLang('')
    setRevBump((n) => n + 1)
  }

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
        <nav className="tabs langs">
          {/* "Original", not "English": the wiki is English-first but a handful
              of entries came in written in another language, and a user is free
              to add "English" as a tab of its own */}
          <button className={lang ? '' : 'on'} onClick={() => showLang('')}>
            Original
          </button>
          {post.translations?.map((t) => (
            <button
              key={t.id}
              className={t.lang === lang ? 'on' : ''}
              onClick={() => showLang(t.lang)}
            >
              {t.lang}
            </button>
          ))}
          <button className="quiet" onClick={() => setForm('new')}>
            + Add a language
          </button>
        </nav>

        <div className="hero">
          <Link className="num" to={numberPath(post.value)}>
            {post.value}
          </Link>
          <h1>{shown.title}</h1>
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

        {form ? (
          <TranslationForm
            post={post}
            editing={form === 'new' ? null : form}
            onCancel={() => setForm(null)}
            onSaved={(next, saved) => {
              setEdited(next)
              setLang(saved)
              setForm(null)
              setRevBump((n) => n + 1) // a translation is an edit of the entry
            }}
          />
        ) : (
          <>
            {shown.body && <div className="body">{shown.body}</div>}
            {tr && (
              <p className="quiet tr-meta">
                <span>
                  {tr.lang} added by {tr.author}
                  {tr.edited_by && `, last edited by ${tr.edited_by}`} ·{' '}
                  {fmtDate(tr.updated_at)}
                </span>
                <button className="btn small" onClick={() => setForm(tr)}>
                  Edit
                </button>
                <button className="btn small" onClick={() => removeTr(tr)}>
                  Remove
                </button>
              </p>
            )}
          </>
        )}

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
                {byline(r)} · {fmtDate(r.at)}
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

/* A delete snapshots under the author "deleted", which reads badly inside a
   sentence that already says "replaced by". If the backend ever words it
   differently this just falls back to the normal phrasing. */
const byline = (r: Revision) =>
  r.author === 'deleted' ? 'deleted' : `replaced by ${r.author}`

/** Write this entry in another language, or rewrite one that is already here. */
function TranslationForm({
  post,
  editing,
  onSaved,
  onCancel,
}: {
  post: Post
  editing: Translation | null
  onSaved: (next: Post, lang: string) => void
  onCancel: () => void
}) {
  const [lang, setLang] = useState(editing?.lang ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [author, setAuthor] = useState(nickname.get())
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    nickname.set(author)
    try {
      const next = await api.translate(post.id, {
        lang,
        title,
        body,
        author: author || 'anonymous',
      })
      onSaved(next, lang)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label>
          Language<span className="hint">whatever people call it — 한국어, Japanese, Español</span>
        </label>
        {/* the language names the tab, so renaming it would orphan the old one;
            rewrite the text here and add a new tab for a different language */}
        <input
          value={lang}
          disabled={!!editing}
          onChange={(e) => setLang(e.target.value)}
          maxLength={40}
          required
        />
      </div>
      <div className="field">
        <label>
          Title<span className="hint">the entry's title in that language</span>
        </label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </div>
      <div className="field">
        <label>
          Details<span className="hint">optional</span>
        </label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
      </div>
      <div className="field">
        <label>Your nickname</label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="anonymous"
          maxLength={40}
        />
      </div>
      {err && <p className="err">{err}</p>}
      <div className="actions">
        <button className="btn primary">{editing ? 'Save' : 'Add this language'}</button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
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
