import { Fragment } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api, BUCKETS, BUCKET_LABEL, FORMATS, FORMAT_LABEL, numberPath,
  type Format, type NumberEntry,
} from '../api'
import { useAsync } from '../useAsync'

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
                        {n.entries.map((e, i) => (
                          <Fragment key={e.id}>
                            {i > 0 && <span className="sep">·</span>}
                            <Link to={`/p/${e.id}`}>{e.title}</Link>
                          </Fragment>
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
