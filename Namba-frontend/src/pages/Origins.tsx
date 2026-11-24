import { Fragment, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api, entryPath, errorText, LANG_CODE, langLabel, nickname, validNickname,
  type Origin, type OriginInput, type OriginRevision,
} from '../api'
import { byName, chain, loops, nameKey, preferLang, rows } from '../origins'
import { ImageButton } from '../components/ImageButton'
import { NicknameField } from '../components/NicknameField'
import { Like } from '../components/PostCard'
import { useAsync } from '../useAsync'
import { revisionBy, useUi } from '../uiLocale'
import FlagPanel from '../components/FlagPanel'
import { fmtCount, fmtDate, numSize } from '../format'
import { FmtTabs, Photo } from './Home'
import { Comments } from './PostPage'

const Name = ({ text, note, head }: { text: string; note?: string | null; head?: boolean }) => (
  <span className={head ? 'og-name head' : 'og-name'}>
    {text}
    {note && <small>{note}</small>}
  </span>
)

/* A chain read left to right: the name, then each name it came from. The
   list's row, the entry page and the form's preview all draw this line, so
   what the form promises is what the other two do. `OriginInput` rather than
   `Origin` because the preview draws links nobody has published yet. */
const Names = ({ links }: { links: readonly OriginInput[] }) => (
  <span className="og-chain">
    <Name text={links[0].name} note={links[0].name_note} head />
    {links.map((l, i) => (
      <Fragment key={i}>
        <span className="og-arrow">←</span>
        <Name text={l.origin} note={l.origin_note ?? links[i + 1]?.name_note} />
      </Fragment>
    ))}
  </span>
)

/* The story of each link, under the form's preview. */
function Steps({ links }: { links: readonly OriginInput[] }) {
  const { m } = useUi()
  return (
    <ol className="og-steps">
      {links.map((l, i) => (
        <li key={i}>
          {/* one link is already named by the line above it */}
          {links.length > 1 && <h3>{l.name} ← {l.origin}</h3>}
          {l.body && <p>{l.body}</p>}
          <div className="meta">
            {l.author && <span>{m.common.by(l.author)}{l.lang ? ` · ${l.lang}` : ''}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* One entry, laid out as PostPage lays out a number's: the hero, the meta
   row with its like and its Show credits / Edit pair, the story as the body,
   and the rail. What a number's page has and a link's does not is a value to
   file under, so the name stands where the numeral does; what a link has and
   a number does not is the names further back, which take the place related
   entries have. Worked out from the whole list, as the list's rows are. */
export function OriginPage({ lang }: { lang: string }) {
  const { locale, m } = useUi()
  const { id } = useParams()
  const got = useAsync(() => api.origins(), [])
  const [credits, setCredits] = useState(false)
  const list = useMemo(() => preferLang(got.data ?? [], lang), [got.data, lang])
  const of = got.data?.find((o) => String(o.id) === id)
  if (got.err) return <p className="err" role="alert">{got.err}</p>
  if (!got.data) return <p className="empty wait" role="status">{m.common.loading}</p>
  if (!of) return <p className="empty">{m.origins.noMatches}</p>
  // the same link in other languages, this one included: the page's tabs
  const told = got.data.filter((o) => samePair(o, of))
  const siblings = list.filter((e) => nameKey(e.origin) === nameKey(of.origin)).length
  const back = chain(byName(list), of).slice(1)
  return (
    <div className="detail-layout">
      <article className="detail">
        {told.length > 1 && (
          <nav className="tabs langs" aria-label={m.post.language}>
            {told.map((o) => (
              <Link
                key={o.id}
                className={o.id === of.id ? 'on' : ''}
                aria-current={o.id === of.id ? 'true' : undefined}
                to={`/origins/${o.id}`}
              >
                {o.lang ?? m.post.original()}
              </Link>
            ))}
          </nav>
        )}

        <div className="hero og-hero">
          <Link className={`num ${numSize(of.name)}`} to={`/origins?q=${encodeURIComponent(of.name)}`}>
            {of.name}
          </Link>
          <h1>
            {of.name_note && <small>{of.name_note}</small>}
            <span className="og-arrow">←</span>
            {of.origin}
            {of.origin_note && <small>{of.origin_note}</small>}
          </h1>
        </div>

        <div className="meta post-meta">
          {/* a name that is a number has a page of its own on this wiki */}
          {/^\d+$/.test(of.origin) && (
            <Link className="tag" to={entryPath(of.origin, 'INTEGER')}>
              {entryPath(of.origin, 'INTEGER')}
            </Link>
          )}
          {siblings > 1 && (
            <Link className="tag" to={`/origins?q=${encodeURIComponent(of.origin)}`}>
              {m.origins.cameFromHere(siblings)}
            </Link>
          )}
          <span className="post-like">
            <Like key={of.id} post={of} origin />
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="meta-btn"
            aria-expanded={credits}
            onClick={() => setCredits((v) => !v)}
          >
            {credits ? m.post.hideCredits : m.post.showCredits}
          </button>
          <span className="meta-sep" aria-hidden="true">/</span>
          <Link className="meta-btn" to={`/origins/${of.id}/edit`}>{m.post.edit}</Link>
        </div>

        {credits && (
          <div className="credits">
            <span>{m.post.writtenBy(of.author, fmtDate(of.created_at, locale))}</span>
            {of.edited_by && <span>{m.post.editedBy(of.edited_by)}</span>}
            <span>{m.post.originalCredit(of.lang)}</span>
            <span className="last">{m.post.editPromise}</span>
          </div>
        )}

        {(of.name_image || of.origin_image) && (
          <div className="og-figs">
            {([[of.name_image, of.name], [of.origin_image, of.origin]] as const).map(
              ([src, name]) => src && (
                <figure key={name}>
                  <img src={src} alt={name} decoding="async" />
                  <figcaption>{name}</figcaption>
                </figure>
              ))}
          </div>
        )}

        {of.body ? (
          <div className="body"><p>{of.body}</p></div>
        ) : (
          <div className="body body-none">
            <p>
              {m.post.noDetails}{' '}
              <Link to={`/origins/${of.id}/edit`}>{m.post.sayMeaning}</Link>
            </p>
          </div>
        )}

        {/* the rest of the chain: each name further back is an entry too */}
        {!!back.length && (
          <>
            <h2 className="section">{m.post.related}</h2>
            {back.map((l) => (
              <div className="rel" key={l.id}>
                <div className="rel-main">
                  <Link className="rel-t" to={`/origins/${l.id}`}>
                    {l.name} <span className="og-arrow">←</span> {l.origin}
                  </Link>
                  {l.body && <div className="rel-b">{l.body}</div>}
                </div>
              </div>
            ))}
          </>
        )}
      </article>
      <Rail key={of.id} of={of} />
    </div>
  )
}

/* The rail an entry has, about the link that was asked for: how its words
   got here, what people make of it, and the one thing to do if it should not
   be here. The same three folds PostPage draws, the last two the same
   components told the id is an origin's. */
function Rail({ of }: { of: Origin }) {
  const { locale, m } = useUi()
  const revs = useAsync(() => api.originRevisions(of.id), [of.id])
  return (
    <aside className="side">
      <details>
        <summary className="ix-fold">
          <h2 className="section">{m.post.editHistory}</h2>{' '}
          {!!revs.data?.length && <span className="n">{fmtCount(revs.data.length, locale)}</span>}
        </summary>
        <ol className="revs">
          <li className="rev now">
            <b>{of.name} ← {of.origin}</b>
            <span>
              {m.post.current} · {of.edited_by ? m.post.editedBy(of.edited_by) : m.common.by(of.author)}
            </span>
          </li>
          {revs.data?.map((r) => (
            <li className="rev" key={r.id}>
              <b>{of.name} ← {of.origin}</b>
              <span>{revisionBy(r.written_by, m)}{' '}<span className="when">· {fmtDate(r.created_at, locale)}</span></span>
            </li>
          ))}
        </ol>
        {!revs.loading && !revs.data?.length && <p className="quiet">{m.post.noEdits}</p>}
      </details>
      <Comments id={String(of.id)} origin />
      <FlagPanel id={of.id} origin />
    </aside>
  )
}

/* The Origins tab: names, and the names they came from. `lang` is the
   reader's entry-text preference from the footer, and here it decides which
   telling of a link is drawn when one has been written in two languages. */
export default function Origins({ lang }: { lang: string }) {
  const { locale, m } = useUi()
  const got = useAsync(() => api.origins(), [])
  /* ?q= is how an entry page hands a name to this list: its only filter,
     read off the address, so the Origins tab is the way back to the whole */
  const q = useSearchParams()[0].get('q') ?? ''
  const list = useMemo(() => preferLang(got.data ?? [], lang), [got.data, lang])
  const needle = nameKey(q)
  const shown = rows(list, true)
    .filter((r) => !needle || r.some((l) =>
      nameKey([l.name, l.name_note, l.origin, l.origin_note, l.body].filter(Boolean).join(' '))
        .includes(needle)))
    .sort((a, b) => a[0].name.localeCompare(b[0].name, locale))

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
      {got.err && <p className="err" role="alert">{got.err}</p>}
      {got.loading && <p className="empty" role="status">{m.common.loading}</p>}
      {got.data && (
        <>
          <p className="quiet">{m.common.entries(list.length)}</p>
          {shown.map((r) => (
            <div className="og-row" key={r[0].id}>
              <Link className="og-link" to={`/origins/${r[0].id}`}>
                <Names links={r} />
                {/* the index's own mark for an entry with a picture */}
                {r.some((l) => l.name_image || l.origin_image) && <Photo label={m.home.hasImage} />}
                <span className="og-teaser">{r.find((l) => l.body)?.body}</span>
              </Link>
              {/* the index's own like: same class, same reveal, same absence
                  on a screen with no hover */}
              <span className="ix-like"><Like post={r[0]} origin /></span>
            </div>
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
type Stop = { name: string; note: string; image: string | null }
const BLANK: Stop = { name: '', note: '', image: null }

/* The chain stood on end: a name, the story, the name it came from, and so
   on down. stops[i] came from stops[i + 1], and stories[i] is how. */
const samePair = (a: OriginInput, b: OriginInput) =>
  nameKey(a.name) === nameKey(b.name) && nameKey(a.origin) === nameKey(b.origin)

/* Edit on a link, shaped like an entry's: the words in fields, and under them
   the same link in other languages. The two names are shown and not offered
   -- they are what the link is, the way a value is what an entry is filed
   under -- and a translation is another row for the same pair, so each one
   is edited on a page of its own. */
export function OriginEdit() {
  const { m } = useUi()
  const { id } = useParams()
  const got = useAsync(() => api.origins(), [])
  const of = got.data?.find((o) => String(o.id) === id)
  if (got.err) return <p className="err" role="alert">{got.err}</p>
  if (!got.data) return <p className="empty" role="status">{m.common.loading}</p>
  if (!of) return <p className="empty">{m.origins.noMatches}</p>
  return <EditFields key={of.id} of={of} others={got.data.filter((o) => o.id !== of.id && samePair(o, of))} />
}

function EditFields({ of, others }: { of: Origin; others: Origin[] }) {
  const { locale, m } = useUi()
  // the link as last saved: `of` is what the page loaded, a restore moves this
  const [cur, setCur] = useState(of)
  const [revs, setRevs] = useState<OriginRevision[]>([])
  useEffect(() => {
    api.originRevisions(of.id).then(setRevs, () => {})
  }, [of.id, cur])
  const nav = useNavigate()
  const uid = useId()
  const [nameNote, setNameNote] = useState(of.name_note ?? '')
  const [originNote, setOriginNote] = useState(of.origin_note ?? '')
  const [nameImage, setNameImage] = useState(of.name_image)
  const [originImage, setOriginImage] = useState(of.origin_image)
  const [body, setBody] = useState(of.body)
  const [written, setWritten] = useState(of.lang ?? '')
  const [author, setAuthor] = useState(nickname.get)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* its own language stays on the menu whatever it is -- an API client may
     have filed one this list does not carry -- and a sibling's does not */
  const langs = [...new Set([of.lang, ...LANGS])]
    .filter((l): l is string => !!l && !others.some((o) => o.lang === l))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validNickname(author)) return setErr(m.common.nicknameRequired)
    nickname.set(author)
    setErr('')
    setBusy(true)
    try {
      await api.editOrigin(of.id, {
        name_note: nameNote.trim() || null, origin_note: originNote.trim() || null,
        body: body.trim(), author: author.trim(), lang: written || null,
        name_image: nameImage, origin_image: originImage,
      })
      nav(`/origins/${of.id}`)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function restore(rev: number) {
    setErr('')
    setBusy(true)
    try {
      // a restore replaces the words, so the fields follow it
      const next = await api.restoreOrigin(of.id, rev, nickname.get())
      setCur(next)
      setNameNote(next.name_note ?? '')
      setOriginNote(next.origin_note ?? '')
      setNameImage(next.name_image)
      setOriginImage(next.origin_image)
      setBody(next.body)
      setWritten(next.lang ?? '')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  /* the filing form's row: the name beside what it is. The name is there to
     be read -- it is what the link is, and an edit does not retype it */
  const stop = (key: string, label: string, name: string, value: string,
                set: (v: string) => void, image: string | null,
                setImage: (v: string | null) => void) => (
    <div className="og-stop">
      <div className="field">
        <label htmlFor={`${uid}-${key}n`}>{label}</label>
        <input id={`${uid}-${key}n`} readOnly value={name} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-${key}`}>
          {m.origins.note} <span className="hint">{m.origins.noteHint}</span>
        </label>
        <input id={`${uid}-${key}`} maxLength={40} value={value}
               onChange={(e) => set(e.target.value)} />
      </div>
      <ImageButton id={`${uid}-${key}i`} value={image} onChange={setImage} onError={setErr} />
    </div>
  )

  return (
    <div className="form-layout">
    <form className="form" onSubmit={submit}>
      <h1>{m.form.editTitle}</h1>
      <fieldset className="form-fields" disabled={busy}>
        <div className="og-rail">
          {stop('n', m.origins.name, of.name, nameNote, setNameNote, nameImage, setNameImage)}
          <div className="field">
            <label htmlFor={`${uid}-s`}>
              {m.origins.story} <span className="hint">{m.origins.storyHint}</span>
            </label>
            <textarea id={`${uid}-s`} maxLength={600} value={body}
                      onChange={(e) => setBody(e.target.value)} />
          </div>
          {stop('o', m.origins.origin, of.origin, originNote, setOriginNote, originImage, setOriginImage)}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-lang`}>{m.form.writtenIn}</label>
          <div className="select narrow">
            <select id={`${uid}-lang`} value={written} onChange={(e) => setWritten(e.target.value)}>
              {langs.map((l) => (
                <option key={l} value={l}>{langLabel(l)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field" role="group" aria-labelledby={`${uid}-tr`}>
          <span className="field-label" id={`${uid}-tr`}>
            {m.form.translations} <span className="hint">{m.form.translationsHint}</span>
          </span>
          <div className="panel">
            {others.map((o) => (
              <div className="panel-row" key={o.id}>
                <span className="panel-lang">{o.lang}</span>
                <span className="panel-title">{o.body}</span>
                <span className="panel-by">{o.edited_by ?? o.author}</span>
                <Link className="pill" to={`/origins/${o.id}/edit`}>{m.form.editTranslation}</Link>
              </div>
            ))}
            <div className="panel-row">
              <Link className="panel-add" to={`/origins/${of.id}/translate`}>
                {m.form.addTranslation}
              </Link>
            </div>
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
            {busy ? m.form.publishing : m.form.saveChanges}
          </button>
          <Link className="btn" to={`/origins/${of.id}`}>{m.common.cancel}</Link>
        </div>
        <p className="fine">{m.form.cc0(false)}</p>
      </fieldset>
    </form>

    {/* the aside PostForm draws. Each row is titled with the link, which
        no version changes, so who and when are what tell them apart */}
    <aside className="side form-side">
      <div className="field" role="group" aria-labelledby={`${uid}-hist`}>
        <span className="field-label" id={`${uid}-hist`}>
          {m.form.history} <span className="hint">{m.form.historyHint}</span>
        </span>
        <div className="panel">
          <div className="panel-row now">
            <div className="panel-main">
              <span className="panel-t now">{of.name} ← {of.origin}</span>
              <span className="panel-m">
                {m.form.current} ·{' '}
                {cur.edited_by ? m.post.editedBy(cur.edited_by) : m.common.by(cur.author)}
              </span>
            </div>
          </div>
          {revs.map((r) => (
            <div className="panel-row" key={r.id}>
              <div className="panel-main">
                <span className="panel-t">{of.name} ← {of.origin}</span>
                <span className="panel-m">
                  {revisionBy(r.written_by, m)}{' '}<span className="when">· {fmtDate(r.created_at, locale)}</span>
                </span>
              </div>
              <button type="button" className="pill" disabled={busy} onClick={() => restore(r.id)}>
                {m.common.restore}
              </button>
            </div>
          ))}
          {!revs.length && <div className="panel-row panel-empty">{m.post.noEdits}</div>}
        </div>
      </div>
    </aside>
    </div>
  )
}

/* "+ Add translation" on the edit page: the form below with this link's two
   names fixed and the languages the pair is already told in off the menu. */
export function OriginTranslate({ lang }: { lang: string }) {
  const { m } = useUi()
  const { id } = useParams()
  const got = useAsync(() => api.origins(), [])
  const of = got.data?.find((o) => String(o.id) === id)
  if (got.err) return <p className="err" role="alert">{got.err}</p>
  if (!got.data) return <p className="empty" role="status">{m.common.loading}</p>
  if (!of) return <p className="empty">{m.origins.noMatches}</p>
  const taken = got.data.filter((o) => samePair(o, of)).map((o) => o.lang)
  return <OriginForm key={of.id} lang={lang} of={of} taken={taken} />
}

/* `of` is the link being translated: its two names are fixed, the languages
   it is already told in are off the menu, and the story is the point. */
export function OriginForm({ lang, of, taken }: {
  lang: string
  of?: Origin
  taken?: (string | null)[]
}) {
  const { m } = useUi()
  const nav = useNavigate()
  const uid = useId()
  const got = useAsync(() => api.origins(), [])
  const [stops, setStops] = useState<Stop[]>(of
    ? [{ name: of.name, note: of.name_note ?? '', image: of.name_image },
       { name: of.origin, note: of.origin_note ?? '', image: of.origin_image }]
    : [BLANK, BLANK])
  const langs = LANGS.filter((l) => !taken?.includes(l))
  const [stories, setStories] = useState<string[]>([''])
  // starts on the language the reader asked to read in, when it is one we list
  const [written, setWritten] = useState(langs.includes(lang) ? lang : langs[0])
  const [author, setAuthor] = useState(nickname.get)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const known = useMemo(() => preferLang(got.data ?? [], written), [got.data, written])
  const draft: OriginInput[] = stories.map((body, i) => ({
    name: stops[i].name.trim(), name_note: stops[i].note.trim() || null,
    origin: stops[i + 1].name.trim(), origin_note: stops[i + 1].note.trim() || null,
    name_image: stops[i].image, origin_image: stops[i + 1].image,
    body: body.trim(), author: author.trim(), lang: written,
  }))
  /* the draft first, so the preview follows what is being typed before it
     follows what is already filed under the same name */
  const names = byName<OriginInput>([...draft.filter((d) => d.name && d.origin), ...known])

  const setStop = (i: number, patch: Partial<Stop>) =>
    setStops((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)))

  function hint(i: number) {
    const k = nameKey(stops[i].name)
    if (!k || of) return ''
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
        <h1>{of ? m.form.translations : m.origins.addTitle}</h1>
        <p className="form-intro">{of ? m.form.translationsHint : m.origins.formIntro}</p>
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
                      readOnly={!!of}
                      value={s.name}
                      onChange={(e) => setStop(i, { name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`${uid}-w${i}`}>
                      {m.origins.note} <span className="hint">{m.origins.noteHint}</span>
                    </label>
                    <input
                      id={`${uid}-w${i}`}
                      maxLength={40}
                      value={s.note}
                      onChange={(e) => setStop(i, { note: e.target.value })}
                    />
                  </div>
                  <ImageButton id={`${uid}-i${i}`} value={s.image}
                               onChange={(image) => setStop(i, { image })} onError={setErr} />
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
                      required={!!of}
                      value={stories[i]}
                      onChange={(e) =>
                        setStories((all) => all.map((x, k) => (k === i ? e.target.value : x)))}
                    />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
          {/* under the rail, not on it: the line stops at the last name */}
          <div className="actions">
            {!of && stories.length < MAX_LINKS && (
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
          <datalist id={`${uid}-names`}>
            {[...new Set(known.flatMap((x) => [x.name, x.origin]))].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <div className="field">
            <label htmlFor={`${uid}-lang`}>{m.form.writtenIn}</label>
            <div className="select narrow">
              <select id={`${uid}-lang`} required value={written ?? ''}
                      onChange={(e) => setWritten(e.target.value)}>
                {langs.map((l) => (
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
          ? <><Names links={chain(names, draft[0])} /><Steps links={chain(names, draft[0])} /></>
          : <p className="fine">{m.origins.previewHint}</p>}
      </aside>
    </div>
  )
}
