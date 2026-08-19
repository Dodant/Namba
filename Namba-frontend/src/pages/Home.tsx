import { Fragment } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api, BUCKETS, BUCKET_LABEL, fmtDate, FORMATS, FORMAT_LABEL, numberPath, tagLabel,
  type Format, type NumberEntry, type Post,
} from '../api'
import { Like } from '../components/PostCard'
import { useAsync } from '../useAsync'

/* one path instead of an icon package -- it inherits currentColor and the
   row's font size, so it stays as quiet as the text beside it */
const PHOTO = (
  <svg className="ix-img" viewBox="0 0 16 16" role="img" aria-label="has an image">
    <rect x="1.4" y="3" width="13.2" height="10" rx="1.6" fill="none"
          stroke="currentColor" strokeWidth="1.3" />
    <circle cx="5.4" cy="6.6" r="1.2" fill="currentColor" />
    <path d="M2.2 12.2 6 8.6l2.4 2.3 2.2-2.1 3.2 3.1" fill="none"
          stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
)

/* what a number looks like when it is spelled out. The short entries are Greek
   and Latin roots, which is why they only ever match at the start of a word:
   "hepta" in Heptapod is a seven, "bi" in Bible is not a two -- and the
   two-letter roots are left out entirely because that is a fight they lose.
   ponytail: a cardinal can still light up inside a bigger number word, so the
   lookahead below fends off the pairs that actually collide (six/sixteen). */
const WORDS: Record<number, string[]> = {
  1: ['one', 'first', 'single', 'mono'],
  2: ['two', 'second', 'twice', 'double', 'duo'],
  3: ['three', 'third', 'tri'],
  4: ['four', 'quad', 'tetra'],
  5: ['five', 'fifth', 'penta', 'quint'],
  6: ['six', 'hexa'],
  7: ['seven', 'hepta', 'sept'],
  8: ['eighth', 'eight', 'oct'],
  9: ['nine', 'ninth', 'nona', 'ennea'],
  10: ['ten', 'deca'],
  11: ['eleven', 'hendeca'],
  12: ['twelve', 'twelfth', 'dozen', 'dodeca'],
  13: ['thirteen'],
  14: ['fourteen'],
  15: ['fifteen'],
  16: ['sixteen'],
  17: ['seventeen'],
  18: ['eighteen'],
  19: ['nineteen'],
  20: ['twenty', 'icosa'],
  30: ['thirty'],
  40: ['forty'],
  50: ['fifty'],
  60: ['sixty', 'sexa'],
  70: ['seventy'],
  80: ['eighty'],
  90: ['ninety'],
  100: ['hundred', 'cent', 'hecto'],
  200: ['bicentennial'],
  1000: ['thousand', 'kilo', 'millenni'],
  10000: ['myriad'],
  1000000: ['million', 'mega'],
}

/* the number as written and the number as spelled, in one pass. The raw value
   is escaped because "3.14" and "11/22/63" are regex if you let them be; only
   INTEGER rows get words, since a TIME sort_key of 100 is 01:40, not a hundred.
   The optional "th" swallows the regular ordinals -- sixth, tenth, hundredth --
   so they light up whole; the irregular ones are spelled out in WORDS, and the
   longest form goes first so "eighth" wins over "eight". */
function marker({ value, format }: NumberEntry) {
  const words = format === 'INTEGER' ? (WORDS[Number(value)] ?? []) : []
  const alts = [
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ...[...words]
      .sort((a, b) => b.length - a.length)
      .map((w) => `\\b${w}(?:th)?(?!teen|ty)`),
  ]
  return new RegExp(`(${alts.join('|')})`, 'gi')
}

/* split on a single capture group: odd slots are the matches, and they keep the
   text's own casing, so "Hepta" stays "Hepta" */
function mark(text: string, rx: RegExp) {
  return text
    .split(rx)
    .map((part, i) =>
      i % 2 ? (
        <b className="hit" key={i}>
          {part}
        </b>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    )
}

/* Two ways to read the same wiki: down the numbers, or along the dates. They
   share nothing but the header, so they are two components rather than one
   with a branch in the middle of its hooks. */
export default function Home({ lang }: { lang: string }) {
  const [params] = useSearchParams()
  return params.get('view') === 'feed' ? <Feed lang={lang} /> : <Index lang={lang} />
}

/* the numeral carries the row, so it is set by how much room the value needs
   rather than at one size that either shouts at "7" or breaks at "299792458" */
const feedSize = (v: string) => (v.length > 7 ? 'long' : v.length > 4 ? 'mid' : '')

function Feed({ lang }: { lang: string }) {
  /* sort=new is already on GET /api/posts (created_at DESC) -- no backend
     change, and no client-side sort over a bounded page that would only be
     right until the twenty-first entry */
  const posts = useAsync(() => api.posts({ sort: 'new', limit: 20, lang }), [lang])

  return (
    <>
      <p className="feed-intro">
        The same wiki, newest first — what people have written this week.
      </p>

      {posts.err && <p className="err">{posts.err}</p>}
      {posts.loading && <p className="empty">Loading…</p>}

      {posts.data?.map((p: Post) => (
        <article className="fx" key={p.id}>
          <Link className={`fx-num ${feedSize(p.value)}`} to={numberPath(p.value)}>
            {p.value}
          </Link>
          <h3>
            <Link to={`/p/${p.id}`}>{p.title}</Link>
          </h3>
          <div className="fx-body">
            {p.body && <p>{p.body}</p>}
            <div className="meta">
              {p.tags.map((t) => (
                <Link key={t} className="tag" to={`/t/${t}`}>
                  {tagLabel(t)}
                </Link>
              ))}
              <span>by {p.author}</span>
              <span>{fmtDate(p.created_at)}</span>
              {p.updated_at !== p.created_at && (
                <span>
                  · edited {fmtDate(p.updated_at)}
                  {p.edited_by && ` by ${p.edited_by}`}
                </span>
              )}
              <span className="likes">♥ {p.likes}</span>
            </div>
          </div>
        </article>
      ))}

      {!posts.loading && !posts.data?.length && (
        <p className="empty">
          Nothing written yet. <Link to="/new">Add the first one.</Link>
        </p>
      )}
    </>
  )
}

function Index({ lang }: { lang: string }) {
  const [params, setParams] = useSearchParams()
  const format = (params.get('format') ?? 'INTEGER') as Format
  const tag = params.get('tag') ?? ''

  const tags = useAsync(() => api.tags(), [])
  const numbers = useAsync(() => api.numbers({ format, tag, lang }), [format, tag, lang])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  const bands =
    format === 'INTEGER'
      ? BUCKETS.map((b) => ({
          label: BUCKET_LABEL[b],
          items: (numbers.data ?? []).filter((n) => n.bucket === b),
        }))
      : [{ label: FORMAT_LABEL[format], items: numbers.data ?? [] }]

  return (
    <>
      <nav className="tabs">
        {FORMATS.map((f) => (
          <Link
            key={f}
            className={f === format ? 'on' : ''}
            to={`/?${new URLSearchParams({ format: f, ...(tag ? { tag } : {}) })}`}
          >
            {FORMAT_LABEL[f]}
          </Link>
        ))}
      </nav>

      <div className="chips">
        <button className={`chip ${tag ? '' : 'on'}`} onClick={() => setParam('tag', '')}>
          All
        </button>
        {(tags.data ?? []).map((t) => (
          <button
            key={t.tag}
            className={`chip ${t.tag === tag ? 'on' : ''} ${t.count ? '' : 'zero'}`}
            onClick={() => setParam('tag', t.tag === tag ? '' : t.tag)}
          >
            {tagLabel(t.tag)}
            <span className="n">{t.count}</span>
          </button>
        ))}
      </div>

      {numbers.err && <p className="err">{numbers.err}</p>}
      {numbers.loading && <p className="empty">Loading…</p>}

      {!numbers.loading &&
        bands.map(
          (band) =>
            band.items.length > 0 && (
              /* <details>, not a button and a piece of state: the browser
                 already knows how to open and close a disclosure, and it
                 gets the keyboard and the screen reader right for free.
                 Open by default -- the index is the page, and five closed
                 headings is a table of contents, not a wiki. */
              <details className="band" key={band.label} open>
                <summary className="band-head">
                  <h2>{band.label}</h2>
                  <span className="rule" />
                  <span className="n">
                    {band.items.length} {band.items.length === 1 ? 'number' : 'numbers'}
                  </span>
                </summary>
                <ol className="index">
                  {band.items.map((n: NumberEntry) => {
                    const rx = marker(n)
                    return (
                    <li className="ix" key={`${n.format}-${n.value}`}>
                      <Link
                        className={`ix-num ${n.value.length > 7 ? 'long' : ''}`}
                        to={numberPath(n.value)}
                      >
                        {n.value}
                      </Link>
                      <div className="ix-titles">
                        {n.entries.map((e) => (
                          // the like sits outside the link: a button inside an
                          // anchor is invalid, and both want the same click
                          <div className="ix-e" key={e.id}>
                            <Link className="ix-link" to={`/p/${e.id}`}>
                              <span className="ix-t">{mark(e.title, rx)}</span>
                              {e.image && PHOTO}
                              {e.body && (
                                <span className="ix-b"> — {mark(e.body, rx)}</span>
                              )}
                            </Link>
                            <span className="ix-like">
                              <Like post={e} />
                            </span>
                          </div>
                        ))}
                      </div>
                    </li>
                    )
                  })}
                </ol>
              </details>
            ),
        )}

      {!numbers.loading && !numbers.data?.length && (
        <p className="empty">
          Nothing here yet. <Link to="/new">Add the first one.</Link>
        </p>
      )}
    </>
  )
}
