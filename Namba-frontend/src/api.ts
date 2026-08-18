export const TAGS = [
  'MOVIE', 'TV', 'ANIME', 'BOOK', 'MUSIC', 'GAME', 'BRAND', 'SPORTS',
  'SCIENCE', 'MATH', 'TECH', 'HISTORY', 'RELIGION', 'MEME',
  'PERSON', 'PLACE', 'MYTH', 'SLANG', 'RULE', 'UNIT',
] as const
export type Tag = (typeof TAGS)[number]

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
  author: string
  edited_by: string | null
  likes: number
  created_at: string
  updated_at: string
  tags: Tag[]
  related?: Post[]
}

export type NumberEntry = {
  value: string
  format: Format
  sort_key: number | null
  bucket: string | null
  entries: { id: number; title: string; body: string; image: boolean }[]
}

export type Revision = {
  id: number
  author: string
  at: string
  snapshot: Post
}

export type PostInput = {
  value: string
  format?: Format | null
  title: string
  body?: string
  image?: string | null
  author?: string
  tags?: Tag[]
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

  numbers: (p: { format?: string; tag?: string } = {}) =>
    req<NumberEntry[]>(`/api/numbers${qs(p)}`),

  posts: (p: Params = {}) => req<Post[]>(`/api/posts${qs(p)}`),

  post: (id: number | string) => req<Post>(`/api/posts/${id}`),

  create: (p: PostInput) => req<Post>('/api/posts', json('POST', p)),

  update: (id: number, p: Partial<PostInput>) =>
    req<Post>(`/api/posts/${id}`, json('PATCH', p)),

  remove: (id: number) => req<null>(`/api/posts/${id}`, { method: 'DELETE' }),

  like: (id: number, on: boolean) =>
    req<{ likes: number }>(`/api/posts/${id}/like`, { method: on ? 'POST' : 'DELETE' }),

  link: (id: number, other_id: number) =>
    req<Post>(`/api/posts/${id}/links`, json('POST', { other_id })),

  unlink: (id: number, other_id: number) =>
    req<Post>(`/api/posts/${id}/links/${other_id}`, { method: 'DELETE' }),

  revisions: (id: number | string) => req<Revision[]>(`/api/posts/${id}/revisions`),

  restore: (id: number, rev: number, author: string) =>
    req<Post>(`/api/posts/${id}/revisions/${rev}/restore`, json('POST', { author })),

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

export const numberPath = (value: string) => `/n/${encodeURIComponent(value)}`

export function fmtDate(s: string) {
  const d = new Date(s)
  return isNaN(+d)
    ? s
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
