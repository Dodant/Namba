/** The back office's client. Thin on purpose: it borrows `req`, `qs` and
    `json` from the wiki's `api.ts` so that one place knows how FastAPI reports
    an error, and adds the shapes the operator's routes answer with.

    Nothing here holds a token. The session is an httpOnly cookie the browser
    sends by existing, which is why every call below looks like a plain fetch
    and why a 401 is the only thing that means "signed out". */
import { json, qs, req, type Params, type Post } from '../api'

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

export const adm = {
  login: (email: string, password: string) =>
    req<Who>('/api/admin/login', json('POST', { email, password })),

  logout: () => req<{ ok: boolean }>('/api/admin/logout', { method: 'POST' }),

  me: () => req<Who>('/api/admin/me'),

  stats: () => req<Stats>('/api/admin/stats'),

  activity: (p: Params = {}) => req<Page<Event>>(`/api/admin/activity${qs(p)}`),
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

export type { Post }
