import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, entryPath } from '../api'
import { fmtCount, showValue } from '../format'
import { KINDS, type Kind, abbrGrids, calendarGrid, integerGrid, integerRange, integerRows } from '../heatmap'
import { useAsync } from '../useAsync'
import { useUi } from '../uiLocale'

/* /heatmap: the tables `heatmap.ts` builds, drawn. */
export default function Heatmap({ lang }: { lang: string }) {
  const { m, locale } = useUi()
  const [params] = useSearchParams()
  const kind: Kind = KINDS.find((k) => k === params.get('format')) ?? 'INTEGER'
  // lang, as the index passes it: the ten-number list draws entry titles
  const got = useAsync(() => api.numbers({ format: kind, lang }), [kind, lang])

  const range = kind === 'INTEGER' ? integerRange(Number(params.get('from')), Number(params.get('span'))) : null
  const span = (from: number, size: number) => `${fmtCount(from, locale)}–${fmtCount(from + size - 1, locale)}`

  const tabs = (
    <nav className="tabs fmts" aria-label={m.heatmap.title}>
      {KINDS.map((k) => (
        // a range is still the Integer tab, one link above the list
        <Link key={k} className={k === kind ? 'on' : undefined}
              aria-current={k === kind && !range ? 'page' : undefined}
              to={k === 'INTEGER' ? '/heatmap' : `/heatmap?format=${k}`}>
          {m.format[k]}
        </Link>
      ))}
    </nav>
  )
  let head
  if (range) {
    head = (
      <>
        <h1>{span(range.from, range.span)}</h1>
        <p><Link to="/heatmap">↑ {m.heatmap.title}</Link></p>
      </>
    )
  } else {
    head = (
      <>
        <h1>{m.heatmap.title}</h1>
        <p>{m.heatmap.intro[kind]}</p>
      </>
    )
  }

  if (got.err) return <article className="body guide">{head}{tabs}<p className="empty" role="alert">{got.err}</p></article>
  if (!got.data) return <article className="body guide">{head}{tabs}<p className="empty" role="status">{m.common.loading}</p></article>

  if (range) {
    const rows = integerRows(got.data, range.from, range.span)
    return (
      <article className="body guide">
        {head}
        {tabs}
        <ul className="heat-list">
          {rows.map((n) => (
            <li key={n.value}>
              <Link className="num" to={entryPath(n.value, 'INTEGER')}>
                {showValue(n.value, n.grouped, locale)}
              </Link>
              <span>
                {n.entries.flatMap((e, i) => [
                  i ? ' · ' : null,
                  <Link key={e.id} to={`/p/${e.id}`}>{e.title}</Link>,
                ])}
              </span>
            </li>
          ))}
        </ul>
      </article>
    )
  }

  const grids = kind === 'CALENDAR' ? [calendarGrid(got.data, locale)]
    : kind === 'ABBR' ? abbrGrids(got.data)
    : [integerGrid(got.data, locale)]
  // one scale across every table on the page
  const max = Math.max(1, ...grids.flatMap((g) => g.rows.flatMap((r) => r.cells.map((c) => c?.n ?? 0))))

  return (
    <article className="body guide">
      {head}
      {tabs}
      {grids.map((grid, g) => (
      <div className="tbl" key={g}>
        <table className={`heat ${kind.toLowerCase()} ${grid.cls ?? ''}`}>
          {grid.heads.length > 0 && (
            <thead>
              <tr>
                <td />
                {grid.heads.map((h) => <th key={h} scope="col"><span>{h}</span></th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {grid.rows.map((row, r) => (
              <tr key={row.label || r}>
                {row.label && <th scope="row">{row.label}</th>}
                {row.cells.map((c, i) => {
                  if (!c) return <td key={i} className="none" />
                  const label = m.heatmap.cell(c.what, c.n)
                  const inner = <>{c.tag && <small>{c.tag}</small>}{c.n || '·'}</>
                  return (
                    <td key={i} style={{ '--heat': `${(c.n / max) * 100}%` } as CSSProperties}
                        className={c.n / max > 0.7 ? 'hot' : undefined}>
                      {c.n ? <Link to={c.to} title={label} aria-label={label}>{inner}</Link>
                        : c.add ? <Link className="add" to={c.add} title={label} aria-label={label}>{inner}</Link>
                        : <span role="img" title={label} aria-label={label}>{inner}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ))}
    </article>
  )
}
