import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftIsStale, openDraft, parseDraft, type DraftFields } from './drafts.ts'

const fields: DraftFields = {
  value: '1.000,5', format: 'DECIMAL', title: 'An unfinished entry', body: 'First\n\nSecond',
  tags: ['book'], image: '/uploads/example.png', lang: 'Korean', grouped: true,
  onThisDay: false, inMemoriam: false, year: '', author: 'amber-owl', coined: 'film',
  numberLocale: 'de', baseUpdatedAt: '2026-09-01T12:00:00.000Z',
  baseContent: JSON.stringify(['1000.5', 'DECIMAL', 'Original title', 'Original body']),
}
const memory = () => {
  const rows = new Map<string, string>()
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => { rows.set(key, value) },
    removeItem: (key: string) => { rows.delete(key) },
  }
}

test('a recovered edit keeps its original conflict timestamp, base content and number locale', () => {
  const storage = memory()
  assert.equal(openDraft('42', () => storage).write(fields), 'saved')
  const recovered = openDraft('42', () => storage).initial
  assert.deepEqual(recovered?.fields, fields)
  assert.ok(recovered!.savedAt > 0)
  assert.equal(openDraft('43', () => storage).initial, null)
  assert.equal(openDraft(undefined, () => storage).initial, null)
})

test('discarding one draft leaves drafts for other entries recoverable', () => {
  const storage = memory()
  const first = openDraft(undefined, () => storage)
  const second = openDraft('42', () => storage)
  first.write({ ...fields, baseUpdatedAt: null })
  second.write(fields)
  assert.equal(first.write(null), 'saved')
  assert.equal(openDraft(undefined, () => storage).initial, null)
  assert.deepEqual(openDraft('42', () => storage).initial?.fields, fields)
})

test('a recovered draft notices another edit even within the same server second', () => {
  const timestamp = fields.baseUpdatedAt!
  assert.equal(draftIsStale(fields, timestamp, fields.baseContent!), false)
  assert.equal(draftIsStale(fields, timestamp, 'Different main content'), true)
  assert.equal(draftIsStale(fields, '2026-09-01T12:00:01.000Z', fields.baseContent!), true)
})

test('a stale tab cannot overwrite or remove a newer draft', () => {
  const storage = memory()
  const first = openDraft('42', () => storage)
  const second = openDraft('42', () => storage)
  first.write(fields)
  assert.equal(second.write({ ...fields, body: 'Other tab' }), 'conflict')
  assert.equal(second.write(null), 'conflict')
  assert.deepEqual(openDraft('42', () => storage).initial?.fields, fields)
})

test('storage refusal is a status, not a crash or a claim that a draft was saved', () => {
  const denied = openDraft(undefined, () => { throw new Error('disabled') })
  assert.equal(denied.initial, null)
  assert.equal(denied.status, 'unavailable')
  assert.equal(denied.write(fields), 'unavailable')
  assert.equal(denied.write(null), 'unavailable')
  const storage = memory()
  const draft = openDraft('42', () => storage)
  storage.setItem = () => { throw new Error('quota exceeded') }
  assert.equal(draft.write(fields), 'unavailable')
  assert.equal(openDraft('42', () => storage).initial, null)
})

test('malformed drafts and foreign image URLs cannot populate a form', () => {
  for (const raw of [null, '', '{broken', 'null', '{}', '[]',
    JSON.stringify({ savedAt: 1, fields: { ...fields, tags: [null] } }),
    JSON.stringify({ savedAt: 1, fields: { ...fields, body: {} } }),
    JSON.stringify({ savedAt: 1, fields: { ...fields, image: 'https://example.com/tracker' } }),
    JSON.stringify({ savedAt: 1, fields: { ...fields, image: '/uploads/../secret' } }),
    JSON.stringify({ savedAt: 1, fields: { ...fields, baseUpdatedAt: 42 } }),
  ]) assert.equal(parseDraft(raw), null, raw ?? 'null')
})
