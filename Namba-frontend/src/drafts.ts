/** Only the unfinished main form, never a server-side revision or account. */
export type DraftFields = {
  value: string
  format: string
  title: string
  body: string
  tags: string[]
  image: string | null
  lang: string
  grouped: boolean
  onThisDay: boolean
  inMemoriam: boolean
  year: string
  author: string
  coined: string
  numberLocale: string
  baseUpdatedAt: string | null
  baseContent: string | null
}

export type Draft = { savedAt: number; fields: DraftFields }
export type DraftStatus = 'saved' | 'unavailable' | 'conflict'

/** A route may construct its next form only after this form's final write.
    Failed writes leave both the route and its live input untouched. */
export function leaveDraft(
  store: { write(fields: DraftFields | null): DraftStatus },
  fields: DraftFields | null,
  proceed: () => void,
): DraftStatus {
  const status = fields ? store.write(fields) : 'saved'
  if (status === 'saved') proceed()
  return status
}

export function draftIsStale(
  base: Pick<DraftFields, 'baseUpdatedAt' | 'baseContent'>,
  updatedAt: string, content: string,
) {
  return base.baseUpdatedAt !== updatedAt || base.baseContent !== content
}

type Storage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function parseDraft(raw: string | null): Draft | null {
  try {
    const draft = JSON.parse(raw ?? 'null')
    if (!draft || !Number.isFinite(draft.savedAt) || draft.savedAt <= 0) return null
    const f = draft.fields
    if (!f || !['value', 'format', 'title', 'body', 'lang', 'year', 'author',
      'coined', 'numberLocale'].every((key) => typeof f[key] === 'string')) return null
    if (!['grouped', 'onThisDay', 'inMemoriam'].every((key) => typeof f[key] === 'boolean')) return null
    if (!Array.isArray(f.tags) || !f.tags.every((tag: unknown) => typeof tag === 'string')) return null
    if (f.image !== null && (typeof f.image !== 'string'
      || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(f.image))) return null
    if (!['baseUpdatedAt', 'baseContent'].every((key) => f[key] === null || typeof f[key] === 'string')) return null
    return draft
  } catch {
    return null
  }
}

/** One new-entry draft, and one per edited entry. The storage getter is inside
    the try block too: browsers may refuse access to localStorage itself.
    Compare before writing so a second tab cannot silently erase this draft. */
export function openDraft(id: string | undefined, storage: () => Storage) {
  const key = `namba.draft.v1:${id ? `edit:${id}` : 'new'}`
  let raw: string | null = null
  let status: DraftStatus = 'saved'
  try { raw = storage().getItem(key) } catch { status = 'unavailable' }
  const initial = parseDraft(raw)
  let lastFields = initial ? JSON.stringify(initial.fields) : null

  function write(fields: DraftFields | null): DraftStatus {
    try {
      const target = storage()
      if (target.getItem(key) !== raw) return 'conflict'
      const nextFields = fields ? JSON.stringify(fields) : null
      if (fields && nextFields === lastFields) return 'saved'
      const next = fields ? JSON.stringify({ savedAt: Date.now(), fields }) : null
      if (next === null) target.removeItem(key)
      else target.setItem(key, next)
      raw = next
      lastFields = nextFields
      return 'saved'
    } catch {
      return 'unavailable'
    }
  }
  return { initial, status, write }
}
