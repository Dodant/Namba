/** Whatever people call it. There is no list to be off: the wiki's working
    vocabulary is the tags in use, which `api.tags()` reports most-used first.
    The API lower-cases and collapses whitespace, so Book and book are one. */
export type Tag = string
/* Both mirror main.py by hand. Drift shows up as a 422 rather than as a
   quietly different rule, which is the same bargain FORMATS makes. */
export const TAG_MAX = 24
export const TAGS_PER_POST = 2

/* Hand-mirrored from `db.py`, which holds them because they are what the TEXT
   columns may contain and both `main.py` and `admin_api.py` need them. Same
   bargain as FORMATS: send one that is not here and the API answers 422 rather
   than storing a value nothing can filter on. */
export const DELETE_REASONS = [
  'DUPLICATE', 'INCORRECT', 'NO_SOURCE', 'SPAM', 'VANDALISM', 'OTHER',
] as const
export const REPORT_REASONS = [
  'INCORRECT', 'SPAM', 'AD', 'ABUSE', 'COPYRIGHT', 'SOURCE', 'VANDALISM', 'OTHER',
] as const
export const POST_STATUSES = ['ACTIVE', 'HIDDEN', 'DELETED'] as const
export const BLOCK_TYPES = ['ip', 'client'] as const
/** What the panel offers, in hours, with null for permanent. The API takes any
    number of hours -- these five are a decision about what an operator should be
    nudged towards, not a limit on what the column holds. */
export const BLOCK_HOURS: (number | null)[] = [1, 24, 24 * 7, 24 * 30, null]
export const BLOCK_HOURS_LABEL: Record<string, string> = {
  '1': 'An hour',
  '24': 'A day',
  '168': 'A week',
  '720': 'A month',
  null: 'Permanent',
}
export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
export const REPORT_STATUSES = ['OPEN', 'RESOLVED', 'IGNORED'] as const

export type PostStatus = (typeof POST_STATUSES)[number]

/** One map for both vocabularies: four of the reasons are in each, and a
    reader picking one does not know or care which list it came from. */
export const REASON_LABEL: Record<string, string> = {
  DUPLICATE: 'It duplicates another entry',
  INCORRECT: 'The information is wrong',
  NO_SOURCE: 'There is no reliable source',
  SOURCE: 'The source is wrong or missing',
  SPAM: 'Spam',
  AD: 'An advertisement',
  ABUSE: 'Abusive or hateful',
  COPYRIGHT: 'A copyright problem',
  VANDALISM: 'Vandalism',
  OTHER: 'Something else',
}

/* The languages this app offers, as endonyms -- the name a language calls
   itself is the one a reader of it recognises -- each with its ISO 639-1 code,
   because an endonym only recognises the reader back. `ไทย` says nothing to
   everyone else and `(th)` does.

   Here rather than in PostForm because the guide's language picker wants the
   same labels, and a second copy is a language spelled two ways. It is still
   mirrored nowhere on the server: the API takes any 40-character string and
   /api/languages reports what the wiki actually says. The code is display
   only -- `lang` is stored as the name.

   langLabel falls back to the bare name, for a language an entry kept after a
   line was taken out of this list. */
export const LANG_CODE: Record<string, string> = {
  'English': 'en', '한국어': 'ko', '日本語': 'ja', '中文': 'zh',
  'Español': 'es', 'Français': 'fr', 'Deutsch': 'de', 'Português': 'pt',
  'Русский': 'ru', 'Italiano': 'it', 'Nederlands': 'nl', 'Polski': 'pl',
  'Türkçe': 'tr', 'Tiếng Việt': 'vi', 'ไทย': 'th', 'Bahasa Indonesia': 'id',
  'हिन्दी': 'hi', 'العربية': 'ar',
}
export const langLabel = (l: string) => (LANG_CODE[l] ? `${l} (${LANG_CODE[l]})` : l)

export const FORMATS = ['INTEGER', 'DECIMAL', 'MIXED', 'TIME', 'ABBR'] as const
export type Format = (typeof FORMATS)[number]

/* An abbreviation is the one kind of entry that is not a number, so it decides
   the address a value is read at -- see entryPath() below. The nouns that used
   to live beside this are `m.common.subject` now, one per interface locale. */
export const isAbbr = (f: Format) => f === 'ABBR'

export const BUCKETS = ['1', '10', '100', '1000', '10000+'] as const
/* The Abbreviation index bands by first letter: one band a letter to W, then
   X – Z together since three near-empty bands is a table of contents, then
   0 – 9 last for MP3 and 3M -- the digits are the odd ones out, so they go
   at the end and not the front ASCII order would give them. The keys are
   what the API returns in `bucket`, from bucket_of() in numfmt.py. */
export const ABBR_BUCKETS: readonly string[] = [...'ABCDEFGHIJKLMNOPQRSTUVW', 'X-Z', '0-9']

export type Post = {
  id: number
  value: string
  format: Format
  sort_key: number | null
  bucket: string | null
  title: string
  body: string
  image: string | null
  /** show the value with thousands separators. Display only -- `value` never
      carries them, or 1000 and 1,000 stop being the same number. */
  grouped: boolean
  author: string
  edited_by: string | null
  /** what this entry's own title and body are written in. Free-form, like a
      translation's label, and null on everything written before it existed. */
  lang: string | null
  likes: number
  /** Always 'ACTIVE' on anything a reader can fetch — a hidden entry leaves
      every public read. It comes down the wire because the row does, and the
      back office is the only place it is ever anything else. */
  status?: PostStatus
  created_at: string
  updated_at: string
  tags: Tag[]
  related?: Post[]
  translations?: Translation[]   // single-post view only
}

/** The same entry written in another language. `lang` is a free-form label. */
export type Translation = {
  id: number
  lang: string
  title: string
  body: string
  author: string
  edited_by: string | null
  created_at: string
  updated_at: string
}

/** How a tag is written on screen: lower-case, as stored and as typed.

    Still a function, and still lower-casing, now that storage is lower-case
    too: /t/:tag can arrive from an old upper-case link, and this is the one
    place that decides how a tag reads. */
export const tagLabel = (t: string) => t.toLowerCase()

/** A tag can hold a space now, and 한국어 is a fine tag. Same reason
    entryPath() exists: the value goes in a path segment. */
export const tagPath = (tag: string) => `/t/${encodeURIComponent(tag)}`

export type NumberEntry = {
  value: string
  format: Format
  sort_key: number | null
  bucket: string | null
  /** true only when every entry filed here asked for separators. A row is one
      number written one way, so a disagreement falls back to the plain form. */
  grouped: boolean
  entries: { id: number; title: string; body: string; image: boolean; likes: number }[]
}

/** A version of an entry, as a label rather than a copy of it. The API reads
    the three fields a history draws out of the stored snapshot and drops the
    rest: a restore is a POST that reads the snapshot server-side, so the
    client never held one for a reason. `grouped` comes along because the value
    reads through it -- 1000 in a history whose entry shows 1,000 is the flag
    missing, not a different number. */
export type Revision = {
  id: number
  author: string
  at: string
  title: string
  value: string
  grouped: boolean
}

/** Something said beside an entry rather than in it. No `edited_by` and no
    revision behind it: once posted, a comment cannot be rewritten or removed.
    That is a decision and not a gap -- with no accounts, a Remove button
    belongs to nobody. */
export type Comment = {
  id: number
  author: string
  body: string
  created_at: string
}

export type PostInput = {
  /** The entry as this client last saw it, sent on an edit so the API can
      refuse a save built on a copy somebody has since changed. Only the edit
      form has it, and only the edit form needs it: the API accepts a write
      without one, because it has no key and a `curl` should not have to read
      before it writes. `updated_at` off the entry, which is what the form
      already holds in `post`. */
  base_updated_at?: string
  value: string
  /** How a value typed in the public form spells its decimal and grouping
      separators. The API stores one locale-neutral value either way. */
  number_locale?: string
  format?: Format | null
  title: string
  body?: string
  image?: string | null
  author?: string
  tags?: Tag[]
  lang?: string | null
  grouped?: boolean
}

export type Params = Record<string, string | number | undefined | null>

/* Exported for the back office's client, which is a separate bundle and needs
   the same three primitives rather than its own copy: one place that knows how
   FastAPI reports an error is the whole point of them. */
export function qs(params: Params) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** What the API refused, and with which status.

    A plain field and not a parameter property: `erasableSyntaxOnly` is on in
    the tsconfigs, and a parameter property is the one class syntax that is not
    erasable.

    `errorText` reads it as the `Error` it is, which is all twenty call sites
    ever wanted. The status is for the one place that has to tell two refusals
    apart: a 409 on a save is somebody else's edit landing first, which is
    worth keeping a draft for, and every other refusal is a sentence to show. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      // FastAPI validation errors arrive as a list of {loc, msg}
      detail = Array.isArray(body.detail)
        ? body.detail.map((d: { msg: string }) => d.msg).join(', ')
        : body.detail ?? detail
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail)
  }
  return res.status === 204 ? (null as T) : res.json()
}

/** What went wrong, as a line to put in front of a reader.

    `req` above throws an `Error` carrying FastAPI's `detail`, so this is that
    sentence nearly every time. It exists because a `catch` binding is
    `unknown`, and every one of the twenty call sites was writing
    `errorText(e)` -- an assertion, at each of them, that what was
    thrown is what we throw. It is, until a browser throws something else on a
    dead connection, and then twenty places are wrong instead of one. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  tags: () => req<{ tag: Tag; count: number }[]>('/api/tags'),

  languages: () => req<{ lang: string; count: number }[]>('/api/languages'),

  numbers: (p: { format?: string; tag?: string; lang?: string } = {}) =>
    req<NumberEntry[]>(`/api/numbers${qs(p)}`),

  posts: (p: Params = {}) => req<Post[]>(`/api/posts${qs(p)}`),

  post: (id: number | string) => req<Post>(`/api/posts/${id}`),

  create: (p: PostInput) => req<Post>('/api/posts', json('POST', p)),

  update: (id: number, p: Partial<PostInput>) =>
    req<Post>(`/api/posts/${id}`, json('PATCH', p)),

  like: (id: number, on: boolean) =>
    req<{ likes: number }>(`/api/posts/${id}/like`, { method: on ? 'POST' : 'DELETE' }),

  link: (id: number, other_id: number) =>
    req<Post>(`/api/posts/${id}/links`, json('POST', { other_id })),

  unlink: (id: number, other_id: number) =>
    req<Post>(`/api/posts/${id}/links/${other_id}`, { method: 'DELETE' }),

  /** PUT, not POST: writing a language twice is an edit, not a second copy. */
  translate: (id: number, t: { lang: string; title: string; body: string; author: string }) =>
    req<Post>(`/api/posts/${id}/translations`, json('PUT', t)),

  untranslate: (id: number, trId: number, author: string) =>
    req<Post>(`/api/posts/${id}/translations/${trId}?author=${encodeURIComponent(author)}`, {
      method: 'DELETE',
    }),

  revisions: (id: number | string) => req<Revision[]>(`/api/posts/${id}/revisions`),

  restore: (id: number, rev: number, author: string) =>
    req<Post>(`/api/posts/${id}/revisions/${rev}/restore`, json('POST', { author })),

  comments: (id: number | string) => req<Comment[]>(`/api/posts/${id}/comments`),

  /** Ask for an entry to go. There is no route that takes one away — this leads
      to a person reading it, which is the whole design. */
  requestDeletion: (
    id: number | string,
    r: { reason: string; detail: string; author: string },
  ) => req<{ id: number; status: string }>(`/api/posts/${id}/delete-request`,
                                           json('POST', r)),

  /** Say something is wrong without asking for the entry to go. No nickname:
      a report is addressed to whoever runs the wiki and read once, and a byline
      on it would only ever be a name to hold against somebody. */
  report: (id: number | string, r: { reason: string; detail: string }) =>
    req<{ id: number; open: number }>(`/api/posts/${id}/report`, json('POST', r)),

  /** Answers with the whole list, newest first, so what comes back *is* the new
      state -- the same shape link() and translate() hand the post back in, and
      the reason nothing here needs a refetch. */
  comment: (id: number | string, c: { author: string; body: string }) =>
    req<Comment[]>(`/api/posts/${id}/comments`, json('POST', c)),

  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<{ url: string }>('/api/upload', { method: 'POST', body: fd })
  },
}

// --- browser-local state: no accounts, so the browser remembers instead ---
export const nickname = {
  get: () => localStorage.getItem('namba.nick') ?? '',
  set: (v: string) => localStorage.setItem('namba.nick', v),
}

/** Which translation the reader prefers for entry text. This is deliberately
    separate from the interface locale: changing buttons to Korean must not
    silently replace what somebody chose to read. The old key is read once as
    a compatibility fallback; new choices only use the explicit content key. */
const CONTENT_LANG = 'namba.contentLang'
const LEGACY_LANG = 'namba.lang'
export const contentLanguage = {
  get: () => localStorage.getItem(CONTENT_LANG) ?? localStorage.getItem(LEGACY_LANG) ?? '',
  set: (v: string) => localStorage.setItem(CONTENT_LANG, v),
}

const LIKED = 'namba.liked'
const likedSet = (): Set<number> =>
  new Set(JSON.parse(localStorage.getItem(LIKED) ?? '[]'))

export const liked = {
  has: (id: number) => likedSet().has(id),
  toggle: (id: number) => {
    const s = likedSet()
    const on = !s.has(id)
    if (on) s.add(id)
    else s.delete(id)
    localStorage.setItem(LIKED, JSON.stringify([...s]))
    return on
  },
}

/** Where a value is read. Two sections over one column: /a/UFO is the
    abbreviation, /n/42 is the number, and an entry has exactly one address.
    The format decides which -- take it off the row, never guess it from the
    characters, since a poster may file UFO as Mixed on purpose. The twin of
    value_path() in main.py, which writes the same link into every canonical. */
export const entryPath = (value: string, format: Format) =>
  `/${isAbbr(format) ? 'a' : 'n'}/${encodeURIComponent(value)}`
