/** The back office's client. Thin on purpose: it borrows `req`, `qs` and
    `json` from the wiki's `api.ts` so that one place knows how FastAPI reports
    an error, and adds the shapes the operator's routes answer with.

    Nothing here holds a token. The session is an httpOnly cookie the browser
    sends by existing, which is why every call below looks like a plain fetch
    and why a 401 is the only thing that means "signed out". */
import { json, qs, req, type Params, type Post, type PostStatus } from '../api'

export type Role = 'ADMIN' | 'SUPER_ADMIN'
export type Who = { id: number; email: string; role: Role }

/** Every list route answers this shape: the page, and the size of the whole
    set so a pager can say "51–100 of 812". */
export type Page<T> = { total: number; rows: T[] }

export type Stats = {
  numbers: number
  entries: number
  hidden: number
  created_today: number
  edited_today: number
  requests_pending: number
  reports_open: number
  edits_24h: number
  writes_1h: number
  blocked: number
  comments: number
}

/** One row of the log. `admin_id` is the whole split: null is a visitor and
    set is an operator's own decision, so the activity feed and the audit log
    are this same row read with two filters. */
export type Event = {
  id: number
  at: string
  action: string
  admin_id: number | null
  actor: string | null
  by: string | null
  target_type: string | null
  target_id: number | null
  revision_id: number | null
  ip_hash: string | null
  ua_hash: string | null
  client_hash: string | null
  meta: string | null
  value: string | null
  title: string | null
  post_status: string | null
}

/** One row of the content table. Not a Post: the list carries the two counts
    that make a badge and leaves out body, tags and translations, because a
    table of two hundred entries should not be two hundred whole entries. */
export type Row = {
  id: number
  value: string
  format: string
  grouped: number
  title: string
  status: PostStatus
  author: string
  edited_by: string | null
  likes: number
  created_at: string
  updated_at: string
  /** FLAGGED is this being above zero. It is not a stored status and never will
      be — `reports` is already the truth, and a column would go stale the
      moment one was resolved. */
  open_reports: number
  pending_requests: number
}

export type Report = {
  id: number
  post_id: number
  reason: string
  detail: string
  ip_hash: string | null
  client_hash: string | null
  status: string
  created_at: string
  decided_at: string | null
  decided_by: number | null
  decision_note: string | null
}

/** Same columns plus a nickname. Kept apart from Report for the reason the
    tables are apart: a report is counted per entry, a request is decided one at
    a time, and the two reason vocabularies do not overlap completely. */
export type Request = Report & { requested_by: string | null }

export type Comment = {
  id: number
  post_id: number
  author: string
  body: string
  created_at: string
}

/** The entry as only an operator sees it: whatever its status, with everything
    hanging off it. The one read in the codebase that passes hidden=True. */
export type FullPost = Post & {
  status: PostStatus
  comments: Comment[]
  reports: Report[]
  requests: Request[]
  revision_count: number
}

/** A revision without its snapshot. The list reads each snapshot to pull a
    title out as a label and drops it — fifty whole entries is megabytes, and
    the diff fetches the two actually being looked at. `number` is the position
    in this list rather than a column: it only means anything in the order it is
    read in. */
export type Rev = {
  id: number
  number: number
  author: string
  at: string
  action: string
  ip_hash: string | null
  client_hash: string | null
  admin_id: number | null
  by: string | null
  title: string | null
  value: string | null
}

/** Fields and body answered apart, which is the readable way round: a changed
    sort key inside a unified text diff is noise, and "the number was quietly
    changed" — the thing an operator is usually hunting — is a field. */
export type Diff = {
  a: string
  b: string
  fields: { name: string; before: unknown; after: unknown }[]
  body: { sign: string; text: string }[]
  tags: { before: string[]; after: string[] }
  translations: { before: string[]; after: string[] }
}

export const adm = {
  login: (email: string, password: string) =>
    req<Who>('/api/admin/login', json('POST', { email, password })),

  logout: () => req<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),

  me: () => req<Who>('/api/admin/me'),

  stats: () => req<Stats>('/api/admin/stats'),

  activity: (p: Params = {}) => req<Page<Event>>(`/api/admin/activity${qs(p)}`),

  posts: (p: Params = {}) => req<Page<Row>>(`/api/admin/posts${qs(p)}`),

  post: (id: number | string) => req<FullPost>(`/api/admin/posts/${id}`),

  revisions: (id: number | string) => req<Rev[]>(`/api/admin/posts/${id}/revisions`),

  diff: (id: number | string, a: string, b: string) =>
    req<Diff>(`/api/admin/posts/${id}/diff${qs({ a, b })}`),

  /** Hide, mark removed, or put back. The same route is the undo, which is what
      makes moderation here cost nothing to reverse. */
  setStatus: (id: number | string, status: PostStatus, note: string) =>
    req<{ id: number; status: PostStatus; was: PostStatus }>(
      `/api/admin/posts/${id}/status`, json('POST', { status, note }),
    ),

  /** Put a revision back, credited to the operator. Adds a revision rather than
      overwriting one, and reaches a hidden entry, which the wiki's own route
      cannot — an entry worth reverting is usually one that was taken down. */
  revert: (id: number | string, rev: number, note: string) =>
    req<FullPost>(`/api/admin/posts/${id}/revisions/${rev}/restore`,
                  json('POST', { note })),
}

/** What `meta` holds, already parsed. It is a JSON blob per action rather than
    a column per action, because the actions do not agree on what is worth
    saying and a table of mostly-null columns says nothing better. */
export function meta(e: Event): Record<string, unknown> {
  if (!e.meta) return {}
  try {
    return JSON.parse(e.meta) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Human words for the log's verbs. Absent from this map is not an error --
    a new action shows its own name, which is readable enough and better than
    the panel needing a release to describe one. */
export const ACTION_LABEL: Record<string, string> = {
  CREATE: 'wrote an entry',
  EDIT: 'edited',
  RESTORE: 'restored a version',
  TRANSLATE: 'added a language',
  UNTRANSLATE: 'removed a language',
  COMMENT: 'commented',
  LINK: 'linked entries',
  UNLINK: 'unlinked entries',
  UPLOAD: 'uploaded a picture',
  DELETE_REQUEST: 'asked for a removal',
  REPORT: 'reported an entry',
  ADMIN_LOGIN: 'signed in',
  ADMIN_LOGOUT: 'signed out',
  ADMIN_CREATE: 'created an operator',
  ADMIN_ACTIVE: 'restored an operator',
  ADMIN_DEACTIVATE: 'revoked an operator',
  ADMIN_PASSWORD: 'changed a password',
  CONTENT_HIDE: 'hid an entry',
  CONTENT_DELETE: 'removed an entry',
  CONTENT_RESTORE: 'put an entry back',
  CONTENT_REVERT: 'reverted an entry',
  REQUEST_APPROVE: 'approved a removal',
  REQUEST_REJECT: 'rejected a removal',
  REPORT_RESOLVE: 'resolved reports',
  REPORT_IGNORE: 'dismissed reports',
  CLIENT_BLOCK: 'blocked a client',
  CLIENT_UNBLOCK: 'lifted a block',
}

export type { Post, PostStatus }
