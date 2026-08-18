import { Fragment } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api, BUCKETS, BUCKET_LABEL, FORMATS, FORMAT_LABEL, numberPath,
  type Format, type NumberEntry,
} from '../api'
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

/* the number is what put an entry on this row, so pick it out of the text --
   split on the raw value, no regex: values like "11/22/63" and "9¾" would need
   escaping, and a plain string separator needs none */
function mark(text: string, value: string) {
  const parts = text.split(value)
  if (parts.length === 1) return text
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <b className="hit">{value}</b>}
      {part}
    </Fragment>
  ))
}

export default function Home() {
  const [params, setParams] = useSearchParams()
  const format = (params.get('format') ?? 'INTEGER') as Format
  const tag = params.get('tag') ?? ''

  const tags = useAsync(() => api.tags(), [])
  const numbers = useAsync(() => api.numbers({ format, tag }), [format, tag])

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
          ALL
        </button>
        {(tags.data ?? []).map((t) => (
          <button
            key={t.tag}
            className={`chip ${t.tag === tag ? 'on' : ''} ${t.count ? '' : 'zero'}`}
            onClick={() => setParam('tag', t.tag === tag ? '' : t.tag)}
          >
            {t.tag}
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
              <section className="band" key={band.label}>
                <h2>{band.label}</h2>
                <ol className="index">
                  {band.items.map((n: NumberEntry) => (
                    <li className="ix" key={`${n.format}-${n.value}`}>
                      <Link
                        className={`ix-num ${n.value.length > 10 ? 'long' : ''}`}
                        to={numberPath(n.value)}
                      >
                        {n.value}
                      </Link>
                      <div className="ix-titles">
                        {n.entries.map((e) => (
                          <Link className="ix-e" key={e.id} to={`/p/${e.id}`}>
                            <span className="ix-t">{mark(e.title, n.value)}</span>
                            {e.image && PHOTO}
                            {e.body && (
                              <span className="ix-b"> — {mark(e.body, n.value)}</span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
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
