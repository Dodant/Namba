/** What the comments in `heatmap.ts` claim, as assertions: the shapes of the
    tables, which cells can hold nothing, and where a cell goes. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NumberEntry } from './api.ts'
import { abbrGrids, calendarGrid, integerGrid, integerRange, integerUp } from './heatmap.ts'

const row = (value: string, sort_key: number | null, k = 1) => ({
  value, sort_key, format: 'INTEGER', bucket: '', grouped: false,
  entries: Array.from({ length: k }, (_, i) => ({ id: i, title: 't' })),
}) as unknown as NumberEntry
const cells = (rows: { cells: ({ n: number } | null)[] }[]) => rows.flatMap((r) => r.cells)

test('the integer table counts 1 to 9,999 and nothing outside it', () => {
  const g = integerGrid([row('0', 0), row('12345', 12345), row('305', 305, 2)], 0, 0, 'en')
  assert.equal(g.rows.length, 4)
  assert.equal(g.rows[2].cells[2]!.n, 2)
  assert.equal(g.rows[2].cells[2]!.to, '/heatmap?from=300&span=100')
  assert.equal(cells(g.rows).reduce((s, c) => s + (c?.n ?? 0), 0), 2)
})

test('a hundred is one row of tens, a thousand ten rows of them', () => {
  assert.equal(integerGrid([], 300, 100, 'en').rows.length, 1)
  assert.equal(integerGrid([], 3000, 1000, 'en').rows.length, 10)
  assert.equal(integerGrid([], 3000, 1000, 'en').rows[0].cells[0]!.to, '/heatmap?from=3000&span=10')
})

test('a number links to its plain spelling, not the first one sorted', () => {
  const g = integerGrid([row('-5', -5), row('05', 5), row('5', 5)], 0, 0, 'en')
  assert.equal(g.rows[0].cells[4]!.n, 3)
  assert.equal(g.rows[0].cells[4]!.to, '/n/5')
})

test('only a range the tables draw is a range', () => {
  assert.deepEqual(integerRange(300, 100), { from: 300, span: 100 })
  for (const [from, span] of [[301, 100], [0, 100], [10000, 1000], [300, 50], [NaN, 10]])
    assert.equal(integerRange(from, span), null)
})

test('up is the range holding this one, or the top table', () => {
  assert.deepEqual(integerUp(340, 10), { from: 300, span: 100 })
  assert.deepEqual(integerUp(3400, 100), { from: 3000, span: 1000 })
  assert.equal(integerUp(40, 10), null)
  assert.equal(integerUp(300, 100), null)
  assert.equal(integerUp(3000, 1000), null)
})

test('the calendar blanks the days a month lacks and opens the form on an empty one', () => {
  const g = calendarGrid([{ ...row('12-25', 1225), format: 'CALENDAR' } as NumberEntry], 'en')
  const feb = g.rows[1].cells
  assert.notEqual(feb[28], null) // a leap day is a fixed date
  assert.equal(feb[29], null)
  assert.equal(g.rows[3].cells[30], null) // April 31
  assert.equal(g.rows[11].cells[24]!.n, 1)
  assert.equal(g.rows[0].cells[1]!.add, '/new?value=01-02&format=CALENDAR')
})

test('an abbreviation is counted by first character, case folded', () => {
  const [letters, digits] = abbrGrids([row('UFO', null), row('ufo', null), row('.NET', null), row('3M', null)])
  const u = letters.rows[1].cells[7]!
  assert.equal(u.tag, 'U')
  assert.equal(u.n, 2)
  assert.match(u.to, /^\/a\//) // one word, two spellings: its page
  assert.equal(letters.rows[1].cells[0]!.n, 1) // .NET is N
  assert.equal(digits.rows[0].cells[3]!.to, '/a/3M')
  assert.equal(letters.rows[1].cells[11]!.to, '/?format=ABBR#band-X-Z')
})
