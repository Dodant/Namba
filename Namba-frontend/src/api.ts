/** Whatever people call it. There is no list to be off: the wiki's working
    vocabulary is the tags in use, which `api.tags()` reports most-used first.
    The API lower-cases and collapses whitespace, so Book and book are one. */
export type Tag = string
/* Both mirror main.py by hand. Drift shows up as a 422 rather than as a
   quietly different rule, which is the same bargain FORMATS makes. */
export const TAG_MAX = 24
export const TAGS_PER_POST = 2

export const FORMATS = ['INTEGER', 'DECIMAL', 'MIXED', 'TIME'] as const
export type Format = (typeof FORMATS)[number]

export const FORMAT_LABEL: Record<Format, string> = {
  INTEGER: 'Integer',
  DECIMAL: 'Decimal',
  MIXED: 'Mixed',
  TIME: 'Time',
}

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
    numberPath() exists: the value goes in a path segment. */
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

type Params = Record<string, string | number | undefined | null>

function qs(params: Params) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
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

const json = (method: string, body: unknown): RequestInit => ({
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

/** Which language the reader wants lists in. '' is "as written". Defaults to
    English rather than '': the index used to substitute English server-side
    because the seeded Korean titles were unreadable to an English reader, and
    that stays true -- it is just answerable now. */
const LANG = 'namba.lang'
export const displayLang = {
  get: () => localStorage.getItem(LANG) ?? 'English',
  set: (v: string) => localStorage.setItem(LANG, v),
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
    numberPath() takes the raw value, and /n/1,000 is a different page. */
export function showValue(value: string, grouped?: boolean) {
  const m = grouped ? GROUPABLE.exec(value) : null
  return m ? m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[2] ?? '') : value
}

export const numberPath = (value: string) => `/n/${encodeURIComponent(value)}`

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
const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'always' })
const MONTH = 30 * 86400
const SPANS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 12 * MONTH], ['month', MONTH], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
]

export function fmtDate(s: string) {
  const d = new Date(s)
  if (isNaN(+d)) return s   // whatever the API said, unchanged -- as before
  const secs = (Date.now() - +d) / 1000
  for (const [unit, per] of SPANS) {
    if (secs >= per) return RTF.format(-Math.floor(secs / per), unit)
  }
  /* under the minute, and also anything stamped by a clock ahead of this one:
     a comment posted "in 6 seconds" is a skew, not news. */
  return 'just now'
}
