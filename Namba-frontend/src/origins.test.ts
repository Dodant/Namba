/** What `origins.ts` claims: links join into chains, a loop ends, and the
    reader's language wins a pair. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byName, chain, loops, preferLang, rows } from './origins.ts'

const L = (name: string, origin: string, lang = 'English') => ({ name, origin, lang })
const JAVA = [
  L('JavaScript', 'Java'), L('Java', 'Java coffee'), L('Java coffee', 'Java island'),
  L('Python', 'Monty Python'), L('spam', 'Monty Python'),
]
const heads = (list: { name: string }[][]) => list.map((r) => r[0].name)

test('links join into a chain, up to case', () => {
  const got = chain(byName(JAVA), L('Mocha', 'JAVASCRIPT'))
  assert.deepEqual(got.map((e) => e.origin), ['JAVASCRIPT', 'Java', 'Java coffee', 'Java island'])
})

test('folded, a name inside a chain gets no row of its own', () => {
  assert.deepEqual(heads(rows(JAVA, true)), ['JavaScript', 'Python', 'spam'])
  assert.equal(rows(JAVA, false).length, JAVA.length)
})

test('a loop is seen, and following one still ends', () => {
  const back = L('Java island', 'JavaScript')
  assert.equal(loops(byName(JAVA), back), true)
  assert.equal(loops(byName(JAVA), L('Mocha', 'JavaScript')), false)
  assert.equal(chain(byName([...JAVA, back]), JAVA[0]).length, 4)
})

test("the reader's language wins a pair, and a pair is drawn once", () => {
  const both = [L('Python', 'Monty Python'), L('python', 'monty python', '한국어'), L('Perl', 'pearl')]
  assert.deepEqual(preferLang(both, '한국어').map((e) => e.lang), ['한국어', 'English'])
  assert.deepEqual(preferLang(both, '').map((e) => e.lang), ['English', 'English'])
})
