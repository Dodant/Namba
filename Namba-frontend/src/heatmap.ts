/* The heatmap's tables, apart from drawing them: what /heatmap counts and
   where each cell goes. No JSX, so `heatmap.test.ts` can load it. */
import { entryPath, type NumberEntry } from './api.ts'
import { fmtCount, monthDays, monthName, showDate } from './format.ts'

/* Three of the index's tabs as tables of counts: the three that band, for the
   same reason each does -- Integer has a magnitude, Calendar a day of the
   year, Abbreviation a first letter. The other three read as one list each
   and would be one cell. */
export const KINDS = ['INTEGER', 'CALENDAR', 'ABBR'] as const
export type Kind = (typeof KINDS)[number]

/* null is a cell that cannot hold anything -- February 30 */
/* tag is drawn in the cell, for a table with no column heads to say it */
/* add is where an empty cell goes, when an empty one is still a page */
export type Cell = { n: number; what: string; to: string; tag?: string; add?: string } | null
export type Grid = { heads: string[]; rows: { label: string; cells: Cell[] }[]; cls?: string }

/* Which integer range ?from= and ?span= name, or null for the top table:
   a hundred or a thousand drawn in cells of ten, or ten listed. */
export function integerRange(from: number, span: number) {
  return [10, 100, 1000].includes(span) && from >= span && from < 10000 && from % span === 0
    ? { from, span } : null
}

/* One level up from a range: the range ten times its size holding it, or the
   top table when that range would start below its own size. */
export function integerUp(from: number, span: number) {
  const up = span * 10
  return from < up ? null : { from: from - (from % up), span: up }
}

/* Integer entries by magnitude and first digit: a row per power of ten, a
   column per leading digit, so 300 to 399 is one cell. Four rows, 1 to 9,999:
   past that the index's own 10000+ band holds a handful, too few to shade.

   A cell with entries opens it: a single number goes to its page, a range to
   `?from=300&span=100`, the same table one level down in cells of ten
   numbers -- one row of them for a hundred, 10×10 for a thousand. Ten is the
   floor: a ten-number cell opens onto the list of what is in it, since a row
   of ten single numbers is that list drawn worse. */
export function integerGrid(data: NumberEntry[], from: number, span: number, locale: string): Grid {
  // entries per whole number, and the spelling a number's link uses: its
  // plain spelling when one is filed, so -5 and 05 do not take 5's cell
  const count = new Map<number, number>()
  const spelt = new Map<number, string>()
  for (const n of data) {
    const v = Math.floor(Math.abs(n.sort_key ?? 0))
    if (v < 1 || v >= 10000) continue // 0 has no first digit
    count.set(v, (count.get(v) ?? 0) + n.entries.length)
    if (!spelt.has(v) || n.value === String(v)) spelt.set(v, n.value)
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
    const size = Math.max(10, span / 100)
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
   The days a month does not have are drawn as nothing, not as zero. A day
   with no entries is still a day somebody can be the first to write on, so
   its cell opens the form with that date filled in. */
export function calendarGrid(data: NumberEntry[], locale: string): Grid {
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
          return {
            n: count.get(value) ?? 0,
            what: showDate(value, locale),
            to: entryPath(value, 'CALENDAR'),
            add: `/new?value=${value}&format=CALENDAR`,
          }
        }),
      }
    }),
  }
}

/* A cell per first character: each letter and each digit, the character
   bucket_of reads a band off, so .NET is N. Two tables on one scale: the
   letters in two rows of thirteen, and the digits under them in one row of
   ten at the same cell size. Each cell names its own character, since rows
   of different characters share no column head.
   A cell holding one word goes to its page; one holding several has no page
   of its own, so it goes to its band on the index. */
const BLOCKS = [
  { rows: ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ'], cols: 13, cls: '' },
  { rows: ['0123456789'], cols: 10, cls: 'digits' },
]

export function abbrGrids(data: NumberEntry[]): Grid[] {
  const cells = new Map<string, { n: number; words: Map<string, string> }>()
  for (const n of data) {
    const k = n.value.toUpperCase().match(/[A-Z0-9]/)?.[0]
    if (!k) continue
    const got = cells.get(k) ?? { n: 0, words: new Map() }
    got.n += n.entries.length
    // case folded, as the /a/ reads fold it: UFO and ufo are one word
    if (!got.words.has(n.value.toUpperCase())) got.words.set(n.value.toUpperCase(), n.value)
    cells.set(k, got)
  }
  return BLOCKS.map(({ rows, cols, cls }) => ({
    heads: [],
    cls,
    rows: rows.map((row) => ({
      label: '',
      cells: Array.from({ length: cols }, (_, i) => {
        const k = row[i]
        if (!k) return null
        const got = cells.get(k)
        const band = /[0-9]/.test(k) ? '0-9' : 'XYZ'.includes(k) ? 'X-Z' : k
        return {
          n: got?.n ?? 0,
          what: k,
          tag: k,
          to: got?.words.size === 1 ? entryPath([...got.words.values()][0], 'ABBR')
                                    : `/?format=ABBR#band-${band}`,
        }
      }),
    })),
  }))
}
