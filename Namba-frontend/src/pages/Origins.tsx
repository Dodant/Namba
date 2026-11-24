import { Fragment, useId, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  api, entryPath, errorText, LANG_CODE, langLabel, nickname, validNickname,
  type OriginInput,
} from '../api'
import { byName, chain, loops, nameKey, preferLang, rows } from '../origins'
import { NicknameField } from '../components/NicknameField'
import { useAsync } from '../useAsync'
import { useUi } from '../uiLocale'
import { FmtTabs } from './Home'

const Name = ({ text, note, head }: { text: string; note?: string | null; head?: boolean }) => (
  <span className={head ? 'og-name head' : 'og-name'}>
    {text}
    {note && <small>{note}</small>}
  </span>
)

/* One chain, drawn the same way by the list and by the form's preview, so
   what the form promises is what the list does. Closed it is the names in a
   row; open it is each link's story. `OriginInput` rather than `Origin`
   because the preview draws links nobody has published yet. */
function Chain({ links, open = false, kids, onPick }: {
  links: readonly OriginInput[]
  open?: boolean
  kids?: Map<string, number>
  onPick?: (name: string) => void
}) {
  const { m } = useUi()
  return (
    <details className="og-row" open={open}>
      <summary>
        <span className="og-chain">
          <Name text={links[0].name} note={links[0].name_note} head />
          {links.map((l, i) => (
            <Fragment key={i}>
              <span className="og-arrow">←</span>
              <Name text={l.origin} note={l.origin_note ?? links[i + 1]?.name_note} />
            </Fragment>
          ))}
        </span>
        <span className="og-teaser">{links.find((l) => l.body)?.body}</span>
      </summary>
      <ol className="og-steps">
        {links.map((l, i) => {
          const n = kids?.get(nameKey(l.origin)) ?? 0
          return (
            <li key={i}>
              <h3>{l.name} ← {l.origin}</h3>
              {l.body && <p>{l.body}</p>}
              <div className="meta">
                {l.author && <span>{m.common.by(l.author)}{l.lang ? ` · ${l.lang}` : ''}</span>}
                {/* a name that is a number has a page of its own on this wiki */}
                {/^\d+$/.test(l.origin) && (
                  <Link to={entryPath(l.origin, 'INTEGER')}>{entryPath(l.origin, 'INTEGER')}</Link>
                )}
                {n > 1 && onPick && (
                  <button type="button" className="meta-btn" onClick={() => onPick(l.origin)}>
                    {m.origins.cameFromHere(n)}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </details>
  )
}

/* The Origins tab: names, and the names they came from. `lang` is the
   reader's entry-text preference from the footer, and here it decides which
   telling of a link is drawn when one has been written in two languages. */
export default function Origins({ lang }: { lang: string }) {
  const { locale, m } = useUi()
  const got = useAsync(() => api.origins(), [])
  const [q, setQ] = useState('')
  const [folded, setFolded] = useState(true)
  const list = useMemo(() => preferLang(got.data ?? [], lang), [got.data, lang])
  const kids = useMemo(() => {
    const k = new Map<string, number>()
    for (const e of list) k.set(nameKey(e.origin), (k.get(nameKey(e.origin)) ?? 0) + 1)
    return k
  }, [list])

  const needle = nameKey(q)
  const shown = rows(list, folded)
    .filter((r) => !needle || r.some((l) =>
      nameKey([l.name, l.name_note, l.origin, l.origin_note, l.body].filter(Boolean).join(' '))
        .includes(needle)))
    .sort((a, b) => a[0].name.localeCompare(b[0].name, locale))
  const names = new Set(list.flatMap((e) => [nameKey(e.name), nameKey(e.origin)])).size

  return (
    <>
      <FmtTabs />
      <header className="og-head">
        <div>
          <h1>{m.origins.title}</h1>
          <p className="feed-intro">{m.origins.intro}</p>
        </div>
        <Link className="btn primary" to="/origins/new">{m.origins.addTitle}</Link>
      </header>
      <div className="og-tools">
        <div className="field">
          <input
            type="search"
            aria-label={m.origins.filter}
            placeholder={m.origins.filter}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="field check">
          <input type="checkbox" checked={folded} onChange={(e) => setFolded(e.target.checked)} />
          {m.origins.folded}
        </label>
      </div>

      {got.err && <p className="err" role="alert">{got.err}</p>}
      {got.loading && <p className="empty" role="status">{m.common.loading}</p>}
      {got.data && (
        <>
          <p className="quiet">{m.origins.count(names, list.length)}</p>
          {shown.map((r) => (
            <Chain
              key={r[0].id}
              links={r}
              kids={kids}
              onPick={(name) => {
                setQ(name)
                window.scrollTo(0, 0)
              }}
            />
          ))}
          {!shown.length && (
            <p className="empty">
              {list.length ? m.origins.noMatches : m.origins.empty}{' '}
              <Link to="/origins/new">{m.common.addFirst}</Link>
            </p>
          )}
        </>
      )}
    </>
  )
}

const LANGS = Object.keys(LANG_CODE)
/* ponytail: four links is five names, and longer than any chain filed so far.
   A longer one is the same form submitted twice -- the second picks up where
   the first stopped, because a chain is only links that meet. */
const MAX_LINKS = 4
type Stop = { name: string; note: string }
const BLANK: Stop = { name: '', note: '' }

/* The chain stood on end: a name, the story, the name it came from, and so
   on down. stops[i] came from stops[i + 1], and stories[i] is how. */
export function OriginForm({ lang }: { lang: string }) {
  const { m } = useUi()
  const nav = useNavigate()
  const uid = useId()
  const got = useAsync(() => api.origins(), [])
  const [stops, setStops] = useState<Stop[]>([BLANK, BLANK])
  const [stories, setStories] = useState<string[]>([''])
  // starts on the language the reader asked to read in, when it is one we list
  const [written, setWritten] = useState(LANGS.includes(lang) ? lang : LANGS[0])
  const [author, setAuthor] = useState(nickname.get)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const known = useMemo(() => preferLang(got.data ?? [], written), [got.data, written])
  const draft: OriginInput[] = stories.map((body, i) => ({
    name: stops[i].name.trim(), name_note: stops[i].note.trim() || null,
    origin: stops[i + 1].name.trim(), origin_note: stops[i + 1].note.trim() || null,
    body: body.trim(), author: author.trim(), lang: written,
  }))
  /* the draft first, so the preview follows what is being typed before it
     follows what is already filed under the same name */
  const names = byName<OriginInput>([...draft.filter((d) => d.name && d.origin), ...known])

  const setStop = (i: number, patch: Partial<Stop>) =>
    setStops((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)))

  function hint(i: number) {
    const k = nameKey(stops[i].name)
    if (!k) return ''
    if (i === 0) {
      const n = known.filter((e) => nameKey(e.name) === k).length
      return n ? m.origins.has(m.common.entries(n)) : ''
    }
    // only the last name: every one above it has its origin right here
    const e = i === stops.length - 1 && known.find((x) => nameKey(x.name) === k)
    return e ? m.origins.known(e.origin) : ''
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.some((d) => !d.name || !d.origin)) return setErr(m.origins.required)
    for (const d of draft) {
      if (nameKey(d.name) === nameKey(d.origin)) return setErr(m.origins.same(d.name))
      if (loops(names, d)) return setErr(m.origins.loop(d.name))
    }
    if (!validNickname(author)) return setErr(m.common.nicknameRequired)
    nickname.set(author)
    setErr('')
    setBusy(true)
    let done = 0
    try {
      /* A loop over one route rather than a batch: each link is an entry that
         is true on its own, so half a chain is still a list of true things. */
      for (const d of draft) {
        await api.createOrigin(d)
        done++
      }
      nav('/origins')
    } catch (e) {
      /* the links that landed leave the form, or pressing Publish again files
         them twice */
      setStops((s) => s.slice(done))
      setStories((s) => s.slice(done))
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-layout">
      <form className="form" onSubmit={submit}>
        <h1>{m.origins.addTitle}</h1>
        <p className="form-intro">{m.origins.formIntro}</p>
        <fieldset className="form-fields" disabled={busy}>
          <div className="og-rail">
            {stops.map((s, i) => (
              <Fragment key={i}>
                <div className="og-stop">
                  <div className="field">
                    <label htmlFor={`${uid}-n${i}`}>
                      {i === 0 ? m.origins.name : i === 1 ? m.origins.origin : m.origins.further}
                    </label>
                    <input
                      id={`${uid}-n${i}`}
                      list={`${uid}-names`}
                      maxLength={80}
                      required
                      value={s.name}
                      onChange={(e) => setStop(i, { name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    {/* the hint is the placeholder here: beside the label it
                        wrapped in this narrow column and pushed the box down
                        out of line with the name's */}
                    <label htmlFor={`${uid}-w${i}`}>{m.origins.note}</label>
                    <input
                      id={`${uid}-w${i}`}
                      maxLength={40}
                      placeholder={m.origins.noteHint}
                      value={s.note}
                      onChange={(e) => setStop(i, { note: e.target.value })}
                    />
                  </div>
                  {hint(i) && <p className="fine">{hint(i)}</p>}
                </div>
                {i < stories.length && (
                  <div className="field">
                    <label htmlFor={`${uid}-s${i}`}>
                      {m.origins.story} <span className="hint">{m.origins.storyHint}</span>
                    </label>
                    <textarea
                      id={`${uid}-s${i}`}
                      maxLength={600}
                      value={stories[i]}
                      onChange={(e) =>
                        setStories((all) => all.map((x, k) => (k === i ? e.target.value : x)))}
                    />
                  </div>
                )}
              </Fragment>
            ))}
            <div className="actions">
              {stories.length < MAX_LINKS && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setStops((x) => [...x, BLANK])
                    setStories((x) => [...x, ''])
                  }}
                >
                  {m.origins.addStep}
                </button>
              )}
              {stories.length > 1 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setStops((x) => x.slice(0, -1))
                    setStories((x) => x.slice(0, -1))
                  }}
                >
                  {m.origins.removeStep}
                </button>
              )}
            </div>
          </div>
          <datalist id={`${uid}-names`}>
            {[...new Set(known.flatMap((x) => [x.name, x.origin]))].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <div className="field">
            <label htmlFor={`${uid}-lang`}>{m.form.writtenIn}</label>
            <div className="select narrow">
              <select id={`${uid}-lang`} value={written} onChange={(e) => setWritten(e.target.value)}>
                {LANGS.map((l) => (
                  <option key={l} value={l}>{langLabel(l)}</option>
                ))}
              </select>
            </div>
          </div>

          <NicknameField
            id={`${uid}-author`}
            label={m.form.nickname}
            hint={m.form.noAccountHint}
            value={author}
            onChange={setAuthor}
          />

          {err && <p className="err" role="alert">{err}</p>}

          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? m.form.publishing : m.form.publish}
            </button>
            <Link className="btn" to="/origins">{m.common.cancel}</Link>
          </div>
          {/* at the button, for the reason PostForm says it there: a waiver
              read after the fact is not one */}
          <p className="fine">{m.form.cc0(false)}</p>
        </fieldset>
      </form>

      <aside className="og-preview">
        <h2 className="section">{m.origins.preview}</h2>
        {draft[0].name && draft[0].origin
          ? <Chain links={chain(names, draft[0])} open />
          : <p className="fine">{m.origins.previewHint}</p>}
      </aside>
    </div>
  )
}
