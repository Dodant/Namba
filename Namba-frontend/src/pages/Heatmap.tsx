import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, entryPath, type NumberEntry } from '../api'
import { fmtCount, monthDays, monthName, showDate } from '../format'
import { useAsync } from '../useAsync'
import { useUi } from '../uiLocale'

/* Three of the index's tabs as tables of counts: the three that band, for the
   same reason each does -- Integer has a magnitude, Calendar a day of the
   year, Abbreviation a first letter. The other three read as one list each
   and would be one cell. */
const KINDS = ['INTEGER', 'CALENDAR', 'ABBR'] as const
type Kind = (typeof KINDS)[number]

/* null is a cell that cannot hold anything -- February 30 */
type Cell = { n: number; what: string; to: string } | null
type Grid = { heads: string[]; rows: { label: string; cells: Cell[] }[] }

/* Integer entries by magnitude and first digit: a row per power of ten, a
   column per leading digit, so 300 to 399 is one cell. Four rows, 1 to 9,999:
   past that the index's own 10000+ band holds a handful, too few to shade.

   A cell with entries opens it: a single number goes to its page, a range to
   `?from=300&span=100`, the same table one level down -- 10×10 cells, each a
   hundredth of the range, or one number when the range is 100 or less. So
   3000 to 3999 is ten-number cells and each of those opens once more onto its
   ten numbers. */
function integerGrid(data: NumberEntry[], from: number, span: number, locale: string): Grid {
  // entries per whole number, and the spelling a number's link uses (the
  // first one filed, when 7 and 007 share a cell)
  const count = new Map<number, number>()
  const spelt = new Map<number, string>()
  for (const n of data) {
    const v = Math.floor(Math.abs(n.sort_key ?? 0))
    if (v < 1 || v >= 10000) continue // 0 has no first digit
    count.set(v, (count.get(v) ?? 0) + n.entries.length)
    if (!spelt.has(v)) spelt.set(v, n.value)
  }
  const cell = (start: number, size: number): Cell => {
    let n = 0
    for (let v = start; v < start + size; v++) n += count.get(v) ?? 0
    const last = start + size - 1
    return {
      n,
      what: size === 1 ? fmtCount(start, locale)
                       : `${fmtCount(start, locale)}–${fmtCount(last, locale)}`,
      to: size === 1 ? entryPath(spelt.get(start) ?? String(start), 'INTEGER')
                     : `/heatmap?from=${start}&span=${size}`,
    }
  }
  if (span) {
    const size = Math.max(1, span / 100)
    return {
      heads: Array.from({ length: 10 }, (_, c) => fmtCount(c * size, locale)),
      rows: Array.from({ length: span / size / 10 }, (_, r) => ({
        label: fmtCount(from + r * 10 * size, locale),
        cells: Array.from({ length: 10 }, (_, c) => cell(from + (r * 10 + c) * size, size)),
      })),
    }
  }
  return {
    heads: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    rows: [0, 1, 2, 3].map((e) => ({
      label: `10${'⁰¹²³'[e]}`,
      cells: Array.from({ length: 9 }, (_, i) => cell((i + 1) * 10 ** e, 10 ** e)),
    })),
  }
}

/* A month per row and a day per column, so the year reads as a calendar.
   The days a month does not have are drawn as nothing, not as zero. */
function calendarGrid(data: NumberEntry[], locale: string): Grid {
  const count = new Map<string, number>()
  for (const n of data) count.set(n.value, (count.get(n.value) ?? 0) + n.entries.length)
  return {
    heads: Array.from({ length: 31 }, (_, d) => String(d + 1)),
    rows: Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      return {
        label: monthName(month, locale),
        cells: Array.from({ length: 31 }, (_, d) => {
          if (d + 1 > monthDays(month)) return null
          const value = `${String(month).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`
          return { n: count.get(value) ?? 0, what: showDate(value, locale), to: entryPath(value, 'CALENDAR') }
        }),
      }
    }),
  }
}

/* A row per first letter, a column per second -- the first two letters or
   digits, the characters bucket_of reads a band off, so .NET is N then E.
   The ten digits are one row and one column, as they are one band. A cell
   holding one word goes to its page; one holding several has no page of its
   own, so it goes to its band on the index. A word with a single letter or
   digit has no second one and is not drawn. */
const ALNUM = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0-9']
const charKey = (c: string) => (/[0-9]/.test(c) ? '0-9' : c)

function abbrGrid(data: NumberEntry[]): Grid {
  const cells = new Map<string, { n: number; words: Map<string, string> }>()
  for (const n of data) {
    const [a, b] = (n.value.toUpperCase().match(/[A-Z0-9]/g) ?? []).map(charKey)
    if (!b) continue
    const k = `${a}${b}`
    const got = cells.get(k) ?? { n: 0, words: new Map() }
    got.n += n.entries.length
    // case folded, as the /a/ reads fold it: UFO and ufo are one word
    if (!got.words.has(n.value.toUpperCase())) got.words.set(n.value.toUpperCase(), n.value)
    cells.set(k, got)
  }
  return {
    heads: ALNUM,
    rows: ALNUM.map((a) => ({
      label: a,
      cells: ALNUM.map((b) => {
        const got = cells.get(`${a}${b}`)
        const band = 'XYZ'.includes(a) ? 'X-Z' : a
        return {
          n: got?.n ?? 0,
          what: `${a}${b}…`,
          to: got?.words.size === 1 ? entryPath([...got.words.values()][0], 'ABBR')
                                    : `/?format=ABBR#band-${band}`,
        }
      }),
    })),
  }
}

export default function Heatmap() {
  const { m, locale } = useUi()
  const [params] = useSearchParams()
  const kind: Kind = KINDS.find((k) => k === params.get('format')) ?? 'INTEGER'
  const got = useAsync(() => api.numbers({ format: kind }), [kind])

  const span = Number(params.get('span'))
  const from = Number(params.get('from'))
  const detail = kind === 'INTEGER' && [10, 100, 1000].includes(span)
    && from >= span && from < 10000 && from % span === 0

  const tabs = (
    <nav className="tabs fmts" aria-label={m.heatmap.title}>
      {KINDS.map((k) => (
        <Link key={k} className={k === kind && !detail ? 'on' : undefined}
              aria-current={k === kind && !detail ? 'page' : undefined}
              to={k === 'INTEGER' ? '/heatmap' : `/heatmap?format=${k}`}>
          {m.format[k]}
        </Link>
      ))}
    </nav>
  )
  const head = detail ? (
    <h1>{fmtCount(from, locale)}–{fmtCount(from + span - 1, locale)}</h1>
  ) : (
    <>
      <h1>{m.heatmap.title}</h1>
      <p>{m.heatmap.intro[kind]}</p>
    </>
  )

  if (got.err) return <article className="body guide">{head}{tabs}<p className="empty" role="alert">{got.err}</p></article>
  if (!got.data) return <article className="body guide">{head}{tabs}<p className="empty" role="status">{m.common.loading}</p></article>

  const grid = kind === 'CALENDAR' ? calendarGrid(got.data, locale)
    : kind === 'ABBR' ? abbrGrid(got.data)
    : integerGrid(got.data, detail ? from : 0, detail ? span : 0, locale)
  const max = Math.max(1, ...grid.rows.flatMap((r) => r.cells.map((c) => c?.n ?? 0)))

  return (
    <article className="body guide">
      {head}
      {tabs}
      <div className="tbl">
        <table className={`heat ${kind.toLowerCase()}`}>
          <thead>
            <tr>
              <td />
              {grid.heads.map((h) => <th key={h} scope="col">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.cells.map((c, i) => {
                  if (!c) return <td key={i} className="none" />
                  const label = m.heatmap.cell(c.what, c.n)
                  return (
                    <td key={i} style={{ '--heat': `${(c.n / max) * 100}%` } as CSSProperties}
                        className={c.n / max > 0.5 ? 'hot' : undefined}>
                      {c.n ? <Link to={c.to} title={label} aria-label={label}>{c.n}</Link>
                           : <span title={label} aria-label={label}>·</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}
