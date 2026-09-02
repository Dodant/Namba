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

export const FORMAT_LABEL: Record<Format, string> = {
  INTEGER: 'Integer',
  DECIMAL: 'Decimal',
  MIXED: 'Mixed',
  TIME: 'Time',
  ABBR: 'Abbreviation',
}

/* An abbreviation is the one kind of entry that is not a number, so it reads
   in its own words wherever the app counts or describes what is on a page.
   One function for both nouns, or the band head and the hero drift apart. */
export const isAbbr = (f: Format) => f === 'ABBR'
export const subjectWord = (abbr: boolean, n = 1) =>
  abbr ? (n === 1 ? 'abbreviation' : 'abbreviations') : n === 1 ? 'number' : 'numbers'

export const BUCKETS = ['1', '10', '100', '1000', '10000+'] as const
export const BUCKET_LABEL: Record<string, string> = {
  '1': '1 – 9',
  '10': '10 – 99',
  '100': '100 – 999',
  '1000': '1,000 – 9,999',
  '10000+': '10,000 and up',
}

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

    It used to sentence-case (MOVIE -> Movie) with a rule keeping short ones
    shouting (TV -> TV), because storage was upper-case and something had to
    turn it back into a word. Lower-case storage makes both unnecessary and
    the second one impossible -- "tv" cannot be told from a two-letter word.
    Still a function, and still lower-casing: /t/:tag can arrive from an old
    upper-case link, and the label is the one place that decides. */
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

export type Revision = {
  id: number
  author: string
  at: string
  snapshot: Post
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
  value: string
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
    throw new Error(detail)
  }
  return res.status === 204 ? (null as T) : res.json()
}

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

/** Markdown source read back as prose, for the one-line previews in lists.
    Deliberately not a parser: a preview only has to stop "**bold**" and "## "
    showing up as punctuation, and the entry page renders the real thing a
    click away. Underscores are only stripped when they wrap a word, so
    snake_case survives. Collapsing whitespace matters as much as the marks --
    a body with blank lines used to sprawl down a feed row. */
export const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')
    .replace(/[*`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/* 4+ digits, because "100" has no thousand to separate. Grouped by regex
   rather than toLocaleString: a 20-digit value is past what a Number holds. */
const GROUPABLE = /^(\d{4,})(\.\d+)?$/

/** The value as it should read on screen. Never use it to build a link --
    entryPath() takes the raw value, and /n/1,000 is a different page. */
export function showValue(value: string, grouped?: boolean) {
  const m = grouped ? GROUPABLE.exec(value) : null
  return m ? m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[2] ?? '') : value
}

/** Where a value is read. Two sections over one column: /a/UFO is the
    abbreviation, /n/42 is the number, and an entry has exactly one address.
    The format decides which -- take it off the row, never guess it from the
    characters, since a poster may file UFO as Mixed on purpose. The twin of
    value_path() in main.py, which writes the same link into every canonical. */
export const entryPath = (value: string, format: Format) =>
  `/${isAbbr(format) ? 'a' : 'n'}/${encodeURIComponent(value)}`

/** Which size class a numeral wears, from how much room the value needs. A
    value is a string a stranger typed -- "7" and "1960년 4월 16일 오후 3시" are
    both valid -- so one font size either shouts at the first or breaks the
    layout on the second, and a viewport clamp cannot tell them apart. Every
    numeral on the wiki reads it: the index rows, the feed, both heroes and the
    cards. Pass what is on screen, not the raw value: grouping adds commas.
    The sizes themselves are in index.css, per surface. */
export const numSize = (shown: string) =>
  shown.length > 7 ? 'long' : shown.length > 4 ? 'mid' : ''

/** How the entry's own tab reads. "Original" is all it can say until someone
    records what the entry was written in, which is null on every entry older
    than the column. Shared so the tab and the edit form cannot drift. */
export const originalLabel = (lang: string | null | undefined) =>
  lang ? `Original (${lang})` : 'Original'

/* How long ago, not which day: "4 minutes ago", "2 days ago", "5 months ago".
   Every date on this wiki is a byline in a list, an edit in a history or a
   remark under an entry, and all three are read to answer how fresh the thing
   is -- "Aug 20, 2026" made the reader do that subtraction on every row.

   Intl.RelativeTimeFormat rather than a table of plurals: it is the platform's
   own, it knows "1 day" from "2 days", and it is the same Intl the absolute
   form was already asking for. numeric: 'always' so the scale stays one voice
   -- 'auto' answers -1 day with "yesterday" and -1 month with "last month",
   which is a different register from "3 weeks ago" above it.

   A month is 30 days here, which is what every relative clock does and is
   invisible at this resolution: nothing turns on whether a five-week-old edit
   reads as 5 weeks or 1 month. The year is twelve of those months rather than
   365 days, so that the five days between them cannot come out as "12 months
   ago" -- the months stop at 11 and hand over. */
const RTF = new Map<string, Intl.RelativeTimeFormat>()
const MONTH = 30 * 86400
const SPANS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 12 * MONTH], ['month', MONTH], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
]
const JUST_NOW: Record<string, string> = {
  ko: '방금 전', ja: 'たった今', 'zh-Hans': '刚刚', es: 'ahora mismo', fr: 'à l’instant',
}

export function fmtDate(s: string, locale = 'en') {
  const d = new Date(s)
  if (isNaN(+d)) return s   // whatever the API said, unchanged -- as before
  const secs = (Date.now() - +d) / 1000
  let formatter = RTF.get(locale)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
    RTF.set(locale, formatter)
  }
  for (const [unit, per] of SPANS) {
    if (secs >= per) return formatter.format(-Math.floor(secs / per), unit)
  }
  /* under the minute, and also anything stamped by a clock ahead of this one:
     a comment posted "in 6 seconds" is a skew, not news. */
  return JUST_NOW[locale] ?? 'just now'
}
