import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api, FORMAT_LABEL, FORMATS, nickname, TAGS, tagLabel,
  type Format, type Tag,
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
  const [author, setAuthor] = useState(nickname.get())
  const [owner, setOwner] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api.post(id).then((p) => {
      setOwner(p.author)
      setValue(p.value)
      setFormat(p.format)
      setTitle(p.title)
      setBody(p.body)
      setTags(p.tags)
      setImage(p.image)
    }, (e: Error) => setErr(e.message))
  }, [id])

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

  return (
    <form className="form" onSubmit={submit}>
      <h1>{editing ? 'Edit entry' : 'Add a number'}</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        {editing
          ? `Anyone can edit anything here${owner ? `, including entries written by ${owner}` : ''}. The version you replace is kept in the history, and ${owner || 'the original author'} stays credited.`
          : 'One entry per meaning. If 42 already exists, this joins it rather than replacing it.'}
      </p>

      <div className="row">
        <div className="field" style={{ flex: 2 }}>
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
        </div>
        <div className="field">
          <label>Format</label>
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
      </div>

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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <img
              src={image}
              alt=""
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }}
            />
            <button type="button" className="btn small" onClick={() => setImage(null)}>
              Remove
            </button>
          </div>
        ) : (
          <input type="file" accept="image/*" onChange={pickImage} />
        )}
      </div>

      <div className="field">
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
      </div>
    </form>
  )
}
