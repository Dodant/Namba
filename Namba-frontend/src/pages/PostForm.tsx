import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api, fmtDate, FORMAT_LABEL, FORMATS, nickname, numberPath, originalLabel,
  showValue, TAGS, tagLabel,
  type Format, type Post, type Revision, type Tag, type Translation,
} from '../api'

export default function PostForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const editing = Boolean(id)

  const [value, setValue] = useState(params.get('value') ?? '')
  const [format, setFormat] = useState<'' | Format>('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [image, setImage] = useState<string | null>(null)
  const [lang, setLang] = useState('')
  const [grouped, setGrouped] = useState(false)
  const [author, setAuthor] = useState(nickname.get())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* the whole entry, not just the fields: the three panels below edit its
     translations, its revisions and its links, none of which are form values */
  const [post, setPost] = useState<Post | null>(null)
  const [revBump, setRevBump] = useState(0)
  const [revs, setRevs] = useState<Revision[]>([])
  const owner = post?.author ?? ''

  /* the fields follow the entry only when the entry itself is replaced -- an
     initial load or a restore. Linking or translating must not walk over a
     title someone is halfway through typing. */
  function fill(p: Post) {
    setPost(p)
    setValue(p.value)
    setFormat(p.format)
    setTitle(p.title)
    setBody(p.body)
    setTags(p.tags)
    setImage(p.image)
    setLang(p.lang ?? '')
    setGrouped(p.grouped)
  }

  useEffect(() => {
    if (!id) return
    api.post(id).then(fill, (e: Error) => setErr(e.message))
  }, [id])

  useEffect(() => {
    if (!id) return
    api.revisions(id).then(setRevs, (e: Error) => setErr(e.message))
  }, [id, revBump])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    nickname.set(author)
    const payload = {
      value,
      format: format || null,
      title,
      body,
      image,
      author: author.trim() || 'anonymous',
      tags,
      lang: lang.trim() || null,
      grouped,
    }
    try {
      const saved = editing
        ? await api.update(Number(id), payload)
        : await api.create(payload)
      nav(`/p/${saved.id}`)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    try {
      setImage((await api.upload(file)).url)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  /* every panel action returns the entry as it now stands, so they all land
     the same way and any of them can report the same error */
  async function run(fn: () => Promise<Post>, replaces = false) {
    setErr('')
    try {
      const next = await fn()
      if (replaces) fill(next)
      else setPost(next)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function remove() {
    if (!confirm('Delete this entry? The previous version stays in its history.')) return
    try {
      await api.remove(Number(id))
      nav(numberPath(value))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{editing ? 'Edit entry' : 'Add a number'}</h1>
      <p className="form-intro">
        {editing
          ? `Anyone can edit anything here${owner ? `, including entries written by ${owner}` : ''}. The version you replace is kept in the history, and ${owner || 'the original author'} stays credited.`
          : 'One entry per meaning. If 42 already exists, this joins it rather than replacing it.'}
      </p>

      <div className="row">
        <div className="field num-field" style={{ flex: 2, minWidth: 190 }}>
          <label>
            Number<span className="hint">42 · 3.14 · 11/22/63 · 10:04PM</span>
          </label>
          <input
            className="mono"
            required
            maxLength={32}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {/* the preview only appears when the box would change something, so
              ticking it on 42 or on 10:04PM visibly does nothing */}
          <label className="check">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) => setGrouped(e.target.checked)}
            />
            Group thousands
            {showValue(value, true) !== value && (
              <span className="hint">{showValue(value, true)}</span>
            )}
          </label>
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Format</label>
          {/* a wrapper only so the caret can be a ::after that follows the
              theme; a background-image would have baked its colour in */}
          <div className="select">
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
              <option value="">Auto-detect</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="field">
        <label>
          Title<span className="hint">what the number refers to</span>
        </label>
        <input
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The Hitchhiker's Guide to the Galaxy"
        />
      </div>

      <div className="field">
        <label>
          Details<span className="hint">optional — why this number, what it means</span>
        </label>
        <textarea
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="The Answer to the Ultimate Question of Life, the Universe, and Everything."
        />
        <p className="fine">
          Markdown works — **bold**, *italic*, [links](https://…), lists,
          headings and tables. A single Enter is a line break.
        </p>
      </div>

      {/* "Written in", not "Language" -- the Languages panel below lists the
          same entry written again, and two adjacent fields a plural apart
          read as the same control twice */}
      <div className="field" style={{ maxWidth: 340 }}>
        <label>
          Written in
          <span className="hint">optional</span>
        </label>
        <input
          maxLength={40}
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          placeholder="한국어 · English · 日本語"
        />
      </div>

      {post && (
        <>
          <Languages post={post} onSaved={setPost} onError={setErr} bumpRevs={() => setRevBump((n) => n + 1)} />

          <div className="field">
            <label>
              History
              <span className="hint">put an earlier version back at this same address</span>
            </label>
            <div className="panel">
              <div className="panel-row now">
                <div className="panel-main">
                  <span className="panel-t now">{post.title}</span>
                  <span className="panel-m">
                    current ·{' '}
                    {post.edited_by ? `edited by ${post.edited_by}` : `by ${post.author}`}
                  </span>
                </div>
              </div>
              {revs.map((r) => (
                <div className="panel-row" key={r.id}>
                  <div className="panel-main">
                    <span className="panel-t">{r.snapshot.title}</span>
                    <span className="panel-m">
                      {byline(r)} · {fmtDate(r.at)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pill"
                    onClick={() =>
                      run(
                        () => api.restore(post.id, r.id, nickname.get() || 'anonymous'),
                        true, // a restore replaces the entry, so the fields follow it
                      ).then(() => setRevBump((n) => n + 1))
                    }
                  >
                    Restore
                  </button>
                </div>
              ))}
              {!revs.length && <div className="panel-row panel-empty">No edits yet — as first written.</div>}
            </div>
          </div>

          <LinkPanel post={post} onLinked={setPost} onError={setErr} />
        </>
      )}

      <div className="field">
        <label>
          Categories<span className="hint">up to 5 — a film of a book gets both</span>
        </label>
        <div className="chips">
          {TAGS.map((t) => (
            <button
              type="button"
              key={t}
              className={`chip ${tags.includes(t) ? 'on' : ''}`}
              onClick={() =>
                setTags(
                  tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t].slice(0, 5),
                )
              }
            >
              {tagLabel(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>
          Image<span className="hint">optional — jpg, png, gif or webp, up to 5 MB</span>
        </label>
        {image ? (
          <div className="file-row">
            <img className="thumb" src={image} alt="" />
            <button type="button" className="pill" onClick={() => setImage(null)}>
              Remove
            </button>
          </div>
        ) : (
          <input className="file" type="file" accept="image/*" onChange={pickImage} />
        )}
      </div>

      <div className="field" style={{ maxWidth: 340 }}>
        <label>
          Your nickname
          <span className="hint">
            {editing ? 'recorded as the editor, not the author' : 'no account, no password'}
          </span>
        </label>
        <input
          maxLength={40}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="anonymous"
        />
      </div>

      {err && <p className="err">{err}</p>}

      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {editing ? 'Save changes' : 'Publish'}
        </button>
        <button type="button" className="btn" onClick={() => nav(-1)}>
          Cancel
        </button>
        {editing && (
          <>
            <span className="spacer" />
            <button type="button" className="btn danger" onClick={remove}>
              Delete this entry
            </button>
          </>
        )}
      </div>
      {editing && (
        <p className="fine">
          Deleting keeps the entry in its history — it can be restored to the same
          address.
        </p>
      )}
    </form>
  )
}

/* A delete snapshots under the author "deleted", which reads badly inside a
   sentence that already says "replaced by". If the backend ever words it
   differently this just falls back to the normal phrasing. */
const byline = (r: Revision) =>
  r.author === 'deleted' ? 'deleted' : `replaced by ${r.author}`

/** The entry written again in other languages. Rewriting one opens it in
    place; removing it lives inside that, behind the row rather than beside
    Rewrite, so a destructive control is never one slip from a benign one. */
function Languages({
  post,
  onSaved,
  onError,
  bumpRevs,
}: {
  post: Post
  onSaved: (p: Post) => void
  onError: (m: string) => void
  bumpRevs: () => void
}) {
  const [open, setOpen] = useState<Translation | 'new' | null>(null)

  return (
    <div className="field">
      <label>
        Languages
        <span className="hint">the same entry, written again — 한국어, Japanese, Español</span>
      </label>
      {open ? (
        <TranslationEditor
          post={post}
          editing={open === 'new' ? null : open}
          onCancel={() => setOpen(null)}
          onSaved={(next) => {
            onSaved(next)
            bumpRevs() // a translation is an edit of the entry
            setOpen(null)
          }}
          onError={onError}
        />
      ) : (
        <div className="panel">
          {/* the entry's own language has no Rewrite: the fields above are its
              editor, and a second one here would be two homes again */}
          <div className="panel-row now">
            <span className="panel-lang">{originalLabel(post.lang)}</span>
            <span className="panel-title">{post.title}</span>
            <span className="panel-by">{post.author}</span>
          </div>
          {post.translations?.map((t) => (
            <div className="panel-row" key={t.id}>
              <span className="panel-lang">{t.lang}</span>
              <span className="panel-title">{t.title}</span>
              <span className="panel-by">{t.edited_by ?? t.author}</span>
              <button type="button" className="pill" onClick={() => setOpen(t)}>
                Rewrite
              </button>
            </div>
          ))}
          <div className="panel-row">
            <button type="button" className="panel-add" onClick={() => setOpen('new')}>
              + Add a language
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Write this entry in another language, or rewrite one that is already here.
    Not a <form>: it sits inside the entry form, and a nested one would submit
    the outer one on Enter. */
function TranslationEditor({
  post,
  editing,
  onSaved,
  onCancel,
  onError,
}: {
  post: Post
  editing: Translation | null
  onSaved: (next: Post) => void
  onCancel: () => void
  onError: (m: string) => void
}) {
  const [lang, setLang] = useState(editing?.lang ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [author, setAuthor] = useState(nickname.get())

  async function save() {
    if (!lang.trim() || !title.trim()) return onError('A language and a title are required.')
    onError('')
    nickname.set(author)
    try {
      onSaved(
        await api.translate(post.id, {
          lang,
          title,
          body,
          author: author || 'anonymous',
        }),
      )
    } catch (e) {
      onError((e as Error).message)
    }
  }

  async function drop() {
    if (!editing) return
    if (!confirm(`Remove the ${editing.lang} version? It stays in the entry's history.`)) return
    onError('')
    try {
      onSaved(await api.untranslate(post.id, editing.id, nickname.get() || 'anonymous'))
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <div className="panel panel-edit">
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
        />
      </div>
      <div className="field">
        <label>
          Title<span className="hint">the entry's title in that language</span>
        </label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>
      <div className="field">
        <label>
          Details<span className="hint">optional — markdown works here too</span>
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
      <div className="actions">
        <button type="button" className="btn primary" onClick={save}>
          {editing ? 'Save' : 'Add this language'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {editing && (
          <>
            <span className="spacer" />
            <button type="button" className="btn danger" onClick={drop}>
              Remove this language
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Search the wiki and attach another entry to this one. Not a <form> for the
    same reason as above; Enter in the field still searches. */
function LinkPanel({
  post,
  onLinked,
  onError,
}: {
  post: Post
  onLinked: (p: Post) => void
  onError: (m: string) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Post[] | null>(null)

  async function search() {
    onError('')
    try {
      const found = await api.posts({ q, limit: 8 })
      setHits(found.filter((p) => p.id !== post.id))
    } catch (e) {
      onError((e as Error).message)
    }
  }

  async function act(fn: () => Promise<Post>) {
    onError('')
    try {
      onLinked(await fn())
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <div className="field">
      <label>
        Related entries<span className="hint">other numbers this one belongs beside</span>
      </label>
      <div className="panel">
        {post.related?.map((r) => (
          <div className="panel-row" key={r.id}>
            <span className="panel-num">{showValue(r.value, r.grouped)}</span>
            <span className="panel-title ink">{r.title}</span>
            <button type="button" className="pill" onClick={() => act(() => api.unlink(post.id, r.id))}>
              Unlink
            </button>
          </div>
        ))}
        <div className="panel-row panel-find">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                search()
              }
            }}
            placeholder="Search the wiki — e.g. Back to the Future"
          />
          <button type="button" className="btn" onClick={search}>
            Search
          </button>
        </div>
        {hits?.map((h) => (
          <div className="panel-row" key={h.id}>
            <span className="panel-num">{showValue(h.value, h.grouped)}</span>
            <span className="panel-title ink">{h.title}</span>
            <button
              type="button"
              className="pill"
              onClick={async () => {
                await act(() => api.link(post.id, h.id))
                const rest = hits.filter((x) => x.id !== h.id)
                setHits(rest.length ? rest : null) // not "no matches" -- none left
              }}
            >
              Link
            </button>
          </div>
        ))}
        {hits?.length === 0 && <div className="panel-row panel-empty">No matches.</div>}
      </div>
    </div>
  )
}
