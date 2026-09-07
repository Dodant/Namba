/** The back office's client. Thin on purpose: it borrows `req`, `qs` and
    `json` from the wiki's `api.ts` so that one place knows how FastAPI reports
    an error, and adds the shapes the operator's routes answer with.

    Nothing here holds a token. The session is an httpOnly cookie the browser
    sends by existing, which is why every call below looks like a plain fetch
    and why a 401 is the only thing that means "signed out". */
import { json, qs, req, type Params, type Post, type PostStatus } from '../api'

export type Role = 'ADMIN' | 'SUPER_ADMIN'
export type Who = { id: number; email: string; role: Role }
export type LoginChallenge = { mfa_required: true; challenge: string }

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

/** A row of the delete-request queue. Carries the entry's number, title and
    current status, because a decision made without seeing what it is about is
    not a decision -- and `post_status` is null when the entry was purged from a
    shell, since the request outlives it. */
export type QueuedRequest = Request & {
  value: string | null
  title: string | null
  post_status: PostStatus | null
}

/** One row per *entry*, not per report: five people objecting to one entry is
    one thing to look at. `lead_id` is the lowest report id in the group and is
    only a stable key -- deciding is keyed on the entry. */
export type ReportGroup = {
  post_id: number
  value: string | null
  title: string | null
  post_status: PostStatus | null
  reports: number
  first_at: string
  last_at: string
  reasons: string
  lead_id: number
}

/** One client's writes over a window. Grouped by IP hash and not by cookie: a
    cookie is cleared in a click, and the question is "this address", not "this
    browser session". `a_client` is one of the cookie hashes seen behind it, so a
    block can be aimed at whichever is the tighter fit. */
export type AbuseRow = {
  ip_hash: string
  writes: number
  browsers: number
  targets: number
  creates: number
  edits: number
  comments: number
  requests: number
  reports: number
  uploads: number
  first_at: string
  last_at: string
  a_client: string | null
  blocked: number
}

/** The same words filed under three or more numbers, which is what an advert
    looks like on a wiki about numbers. The one pattern of the four the brief
    names that a query answers outright; the rest need scoring, and the shape
    for it is `clients` above -- one row per client per window. */
export type Duplicate = {
  /** The first 90 characters of the paragraph they all share. */
  said: string
  entries: number
  /** How many different titles it was filed under. It is usually the same as
      `entries`, and a spammer varying the title is what makes that so. */
  titles: number
  ids: string
}

export type Abuse = {
  since: string
  minutes: number
  clients: AbuseRow[]
  duplicates: Duplicate[]
}

export type Block = {
  id: number
  type: string
  target_hash: string
  reason: string
  created_at: string
  created_by: number
  expires_at: string | null
  lifted_at: string | null
  lifted_by: number | null
  by: string | null
  live: number
}

export type Operator = {
  id: number
  email: string
  role: Role
  /** 0 is revoked. There is no delete, because every audit row points here and
      an operator who leaves must not take their record with them. */
  active: number
  created_at: string
  last_login_at: string | null
  /** A password alone never signs in. False means shell enrollment is pending. */
  totp_enabled: number
}

export const adm = {
  login: (email: string, password: string) =>
    req<LoginChallenge>('/api/admin/login', json('POST', { email, password })),

  loginTotp: (challenge: string, code: string) =>
    req<Who>('/api/admin/login/totp', json('POST', { challenge, code })),

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

  requests: (p: Params = {}) =>
    req<Page<QueuedRequest>>(`/api/admin/delete-requests${qs(p)}`),

  /** Approving hides the entry as DELETED and closes every other pending
      request on it -- they were all asking for what just happened. Rejecting
      closes this row alone, because it was about its own reason. */
  decideRequest: (reqId: number, decision: 'APPROVE' | 'REJECT', note: string) =>
    req<{ id: number; status: string }>(
      `/api/admin/delete-requests/${reqId}/decide`, json('POST', { decision, note })),

  reports: (p: Params = {}) => req<Page<ReportGroup>>(`/api/admin/reports${qs(p)}`),

  /** Every report filed against one entry, so a grouped row can be opened. The
      hashes come with them: the same hash on four entries is the difference
      between a problem and a campaign. */
  reportDetail: (postId: number) => req<Report[]>(`/api/admin/reports/${postId}/detail`),

  /** Closes every open report on one entry at once, because that is the unit the
      page shows and the unit an operator actually decides. It does nothing to
      the entry -- hiding it is its own button with its own audit row. */
  decideReports: (postId: number, decision: 'RESOLVE' | 'IGNORE', note: string) =>
    req<{ post_id: number; status: string; closed: number }>(
      `/api/admin/reports/${postId}/decide`, json('POST', { decision, note })),

  abuse: (p: Params = {}) => req<Abuse>(`/api/admin/abuse${qs(p)}`),

  blocks: (p: Params = {}) => req<Page<Block>>(`/api/admin/blocks${qs(p)}`),

  /** `hours: null` is permanent, and has to be sent as such: a block nobody
      chose the length of should not be the forever one. */
  addBlock: (b: { type: string; target_hash: string; reason: string; hours: number | null }) =>
    req<{ id: number; expires_at: string | null }>('/api/admin/blocks', json('POST', b)),

  liftBlock: (id: number) =>
    req<{ id: number; lifted: boolean }>(`/api/admin/blocks/${id}/lift`,
                                         { method: 'POST' }),

  admins: () => req<Operator[]>('/api/admin/admins'),

  /** Still not a signup: it needs a super admin's live session, and there is no
      route a visitor can reach that creates anything here. */
  addAdmin: (b: { email: string; password: string; role: Role }) =>
    req<Who>('/api/admin/admins', json('POST', b)),

  /** Revoked, never deleted: every row of the log points at an id here. */
  setAdminActive: (id: number, active: boolean) =>
    req<{ id: number; active: boolean }>(`/api/admin/admins/${id}/active`,
                                         json('POST', { active })),
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
