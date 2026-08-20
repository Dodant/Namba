# Back office for an anonymous wiki

2026-08-20. Approved in chat before implementation.

An operator surface for Namba: a dashboard, content moderation, delete
requests, reports, abuse signals, client blocking and an audit log — without
giving readers accounts and without ever hard-deleting anything through the
API.

## What already exists, and is not being rebuilt

| The spec asks for | What is already here |
|---|---|
| Revision history with before/after content | `revisions` + `snapshot()`, taken before every edit and restore. The snapshot is the whole post as JSON, so "before" is revision N and "after" is N+1 or the live row. **Schema unchanged.** |
| A restore that creates a new revision instead of overwriting | `restore_revision()` already calls `snapshot()` first |
| `revision_number` | The index in the ordered list. Not a column. |
| Search, status filter, sort, pagination | `list_posts` already takes `q`, `sort`, `limit`, `offset` |
| A place to hook abuse checks | `rate_limit` is the single `Depends` on every write route |
| An admin "edit content" action | The public `PATCH /api/posts/{id}`. The admin UI links to `/p/:id/edit`; no new endpoint. |
| A diff | `difflib` (stdlib). No JS diff dependency. |
| Password hashing | `hashlib.scrypt` (stdlib). No bcrypt, no passlib. |

## Four deliberate deviations from the spec

1. **`FLAGGED` is derived, not stored.** Stored status is `ACTIVE` / `HIDDEN`
   / `DELETED`. `FLAGGED` means "has at least one open report", and `reports`
   is already the truth for that — a stored copy goes stale the moment a
   report is resolved. The content table still draws a FLAGGED badge.
2. **`action`, `ip_hash` and `ua_hash` go on a new `events` table, not on
   `revisions`.** `revisions` answers "what was it"; `events` answers "who did
   what". `delete_post` writing the string `"deleted"` into `revisions.author`
   is the scar left by conflating them. A CREATE also has no prior state to
   snapshot, so it cannot live in `revisions` at all.
3. **The audit log is the same `events` table.** `admin_id IS NULL` is an
   anonymous action, a set `admin_id` is an audit row. Two tables of the same
   shape would make the dashboard's recent-activity list a UNION.
4. **No bulk actions in the first pass.** They double every confirm-modal and
   partial-failure path for an operator who has one account and twenty rows.
   Everything else common to the admin pages — search, filter, sort,
   pagination, status badges, detail drawer or page — is in.

`HIDDEN` and `DELETED` behave identically and both stay: "an operator took it
down" and "a delete request was approved" have to be distinguishable in the
list, and a text column costs nothing.

## Schema

Added to `db.SCHEMA`, with the guarded `ALTER TABLE` pass in `db.init()` for
the one new column on an existing table. No ORM, no migration tool.

```sql
ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
-- ACTIVE | HIDDEN | DELETED. No index: three values, and almost every row is
-- ACTIVE, so it would never be selective. A few thousand rows scan in
-- microseconds.

-- Operators only. Readers have no accounts and never will.
CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,          -- scrypt$n$r$p$salt_hex$hash_hex
  role TEXT NOT NULL DEFAULT 'ADMIN',   -- ADMIN | SUPER_ADMIN
  active INTEGER NOT NULL DEFAULT 1,    -- deactivated, never deleted: audit rows point here
  created_at TEXT NOT NULL,
  last_login_at TEXT);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,          -- sha256 of the cookie value, so a leaked
                                        -- database does not hand over live sessions
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL);

-- Everything that happened. admin_id NULL means an anonymous visitor did it;
-- set means it is an audit row. Append-only: nothing in this codebase issues
-- an UPDATE or DELETE here. No foreign keys, for the same reason revisions has
-- none -- a record of what happened to a thing must outlive the thing.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  admin_id INTEGER,
  actor TEXT,                           -- the nickname typed, when there was one
  target_type TEXT,                     -- post | request | report | block | admin
  target_id INTEGER,
  revision_id INTEGER,                  -- the snapshot this action superseded
  ip_hash TEXT, ua_hash TEXT, client_hash TEXT,
  meta TEXT);                           -- JSON: reason, note, whatever the action needs
CREATE INDEX idx_events_at ON events(id DESC);
CREATE INDEX idx_events_target ON events(target_type, target_id, id DESC);
CREATE INDEX idx_events_ip ON events(ip_hash, id DESC);

CREATE TABLE delete_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,             -- no FK: a request outlives what it asks about
  reason TEXT NOT NULL,                 -- DUPLICATE INCORRECT NO_SOURCE SPAM VANDALISM OTHER
  detail TEXT NOT NULL DEFAULT '',
  requested_by TEXT,
  ip_hash TEXT, ua_hash TEXT, client_hash TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | APPROVED | REJECTED
  created_at TEXT NOT NULL,
  decided_at TEXT, decided_by INTEGER, decision_note TEXT);
CREATE INDEX idx_delete_requests_status ON delete_requests(status, id DESC);
CREATE INDEX idx_delete_requests_post ON delete_requests(post_id);

-- Nearly the same shape as delete_requests and deliberately not the same
-- table: a report is aggregated per entry (count, first seen, last seen) while
-- a request is decided one at a time, the reason vocabularies differ, and the
-- dashboard counts them separately.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  reason TEXT NOT NULL,                 -- INCORRECT SPAM AD ABUSE COPYRIGHT SOURCE VANDALISM OTHER
  detail TEXT NOT NULL DEFAULT '',
  ip_hash TEXT, ua_hash TEXT, client_hash TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | RESOLVED | IGNORED
  created_at TEXT NOT NULL,
  decided_at TEXT, decided_by INTEGER, decision_note TEXT);
CREATE INDEX idx_reports_post ON reports(post_id, id DESC);
CREATE INDEX idx_reports_status ON reports(status, id DESC);

CREATE TABLE blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                   -- ip | client
  target_hash TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT,                      -- NULL is permanent
  created_by INTEGER NOT NULL,
  lifted_at TEXT);                      -- lifting edits the row; it never deletes it
CREATE INDEX idx_blocks_target ON blocks(target_hash);
```

### No raw IP is stored

`ip_hash = sha256(secret + ip)`, `ua_hash` the same, and
`client_hash = sha256(secret + the namba_cid cookie)` so a visitor on a
rotating address is still one client. Only the first four hex characters are
ever shown (`a9f3***`).

`secret` comes from `NAMBA_SECRET`, and when that is unset it is generated once
into `secret.key` beside the database, mode 0600. It must be durable: a secret
that changes on restart silently voids every stored block, which is worse than
a missing environment variable because nothing fails loudly.

## API

### Public, in `main.py`

- `DELETE /api/posts/{id}` is **removed**. With the route gone the path answers
  405, since GET and PATCH still live there.
- `POST /api/posts/{id}/delete-request` — anonymous, 201.
- `POST /api/posts/{id}/report` — anonymous, 201.
- `rate_limit` becomes `guard`: check blocks, then the rate window, then record
  the event. Every call site stays `_=Depends(guard)`, so the ten of them do not
  change.
- **Eight public reads gain `status = 'ACTIVE'`.** This is the one dangerous
  edit in the whole design; see Testing below.

### Admin, in `admin_api.py` — `APIRouter(prefix="/api/admin")`

Everything except the three session routes sits behind `Depends(admin)`. The
router is included **before** the SPA catch-all, which must stay the last route
in `main.py`.

```
POST   login                              (no auth) sets the session cookie
POST   logout                             deletes the session row and the cookie
GET    me                                 who am I; the admin SPA's auth check
GET    stats                              the dashboard counters
GET    activity                           recent events, paged
GET    posts                              q, status, flagged, sort, limit, offset, total
GET    posts/{id}                         the entry whatever its status, plus counts
GET    posts/{id}/revisions               all of them, no REVISIONS_SHOWN cap
GET    posts/{id}/diff?a=&b=              difflib on the body, field pairs for the rest
POST   posts/{id}/status                  {status, note} -- hide, delete, restore
POST   posts/{id}/revisions/{rev}/restore an admin restore, audited
GET    delete-requests                    filter by status
POST   delete-requests/{id}/decide        {decision, note}; approve soft-deletes
GET    reports                            grouped per entry: count, first, last
POST   reports/{id}/decide                {decision, note}
GET    abuse                              events grouped by ip_hash over a window
GET    blocks
POST   blocks                             {type, target_hash, reason, duration}
POST   blocks/{id}/lift
GET    audit                              events where admin_id IS NOT NULL
GET    admins                             SUPER_ADMIN
POST   admins                             SUPER_ADMIN
POST   admins/{id}/deactivate             SUPER_ADMIN
```

`POST .../status` rather than PATCH: it is a moderation command that also
writes an audit row, the same kind of thing `/like` and `/restore` already are.

The diff response carries `fields` (`value: 42 -> 43`, `tags: +movie -book`)
separately from the unified body diff. Folding a changed sort key into a text
diff makes it unreadable.

### Three new backend files

`auth.py` (hashing, sessions, the `admin` dependency, client hashing),
`admin_api.py` (the router), `admin.py` (the CLI). They are not folded into
`main.py` because 600 more lines there stops it being a file anyone reads, and
because the catch-all's position makes include order a rule worth stating once.

## Admin authentication

- `hashlib.scrypt`, n=2^14, r=8, p=1, a 16-byte salt. An unknown email is
  hashed against a dummy anyway, so login timing does not reveal which
  addresses exist. Comparison is `secrets.compare_digest`.
- The session is an opaque `secrets.token_urlsafe(32)`; the cookie is
  `httpOnly`, `SameSite=Strict`, and `Secure` when the request arrived over
  https. Not a JWT: logout and deactivation have to take effect at once.
- Login has its own limiter, 5 a minute per IP. The write limiter's 20 is
  generous for password guessing.
- **No signup route.** `admin.py add <email>` prompts with `getpass` and is how
  the first operator exists at all. Settings -> Admin Accounts lets a
  SUPER_ADMIN add and deactivate. No reset tokens, no email verification, no
  profile screens.
- `admin.py purge <id>` is the only hard delete anywhere: the post, its
  revisions and its image, for a removal the law requires. It is a shell
  command because the person with shell access is the operator, and because
  `DELETE FROM posts` alone leaves the body in `revisions`, which is exactly
  the data such a removal is about.

## Front end

`/admin` is its own document: `admin.html` as a second Vite entry, and two
lines in the catch-all serving `dist/admin.html` for `/admin*`. The public
bundle keeps its size — the wiki's whole identity is a fast read page — and
`index.css`, 1333 lines in which every control is a 999px capsule, cannot bleed
into a dense table UI.

```
admin.html
src/admin/
  main.tsx  AdminApp.tsx  admin.css  api.ts  ui.tsx
  pages/  Login Dashboard Content ContentDetail DeleteRequests
          Reports Abuse Blocks Audit Admins
```

`src/admin/api.ts` imports `req`, `qs` and the `Post` / `Revision` types from
`../api`; the pages use the existing `useAsync`, `fmtDate`, `showValue` and
`numberPath`. `ui.tsx` holds Table, Badge, Filters, Pagination, Confirm and
Drawer. Content detail is a page because the diff needs the width; requests,
reports and blocks open in a drawer.

On the public side, `PostPage`'s right rail gains a third `<details>`, "Flag a
problem": one toggle between reporting and requesting deletion, one reason
select, one detail box. That is the rail comments already live in, and for the
same documented reason — it writes something *beside* the entry rather than
changing it, so it does not belong at `/edit`. `PostForm` loses its Delete
button, the `.spacer` that kept it away from Save, and the fine print under it.

## Testing

`test_namba.py` stays plain asserts with no pytest and no fixtures.

- **`test_hidden_is_invisible`** is the guard for the whole soft-delete change:
  hide an entry, then assert it is absent from `/api/numbers`, `/api/posts`,
  `/api/posts/{id}`, `/api/tags`, `/api/languages`, its revisions, its
  comments, and the server-rendered `<head>` for `/p/{id}` — then restore it
  and assert it is back. Eight query sites need the status condition and
  missing one leaks hidden content.
- `test_no_public_delete` — `DELETE /api/posts/{id}` answers 405.
- `test_admin_auth` — every admin route 401s without a cookie; a wrong password
  401s; a correct one sets a session; logout kills it; deactivating an admin
  kills their live session.
- `test_delete_request_flow`, `test_reports`, `test_blocking`, `test_diff`.
- Six existing `c.delete(...)` calls are rewritten. Four are fixture teardown.
  Two are load-bearing: `test_grouping` asserts that a number's separators come
  back "once the disagreement goes", which was a delete and is now a hide —
  because a hidden entry must not get a vote on how its number is written.

## Documentation to revise

The root `CLAUDE.md` says "No accounts, ever ... Anyone reads, posts, edits and
deletes. Every guard in the codebase assumes this — do not fix it by adding
auth." Half of that is what this design changes, so it is revised out loud:
**no reader accounts, ever**, with `admins` named as the single exception,
because an operator's decisions have to carry a name and be reversible. Delete
stops being anyone's button and becomes a request an operator decides.

The "Kept in sync by hand" table gains a row: the status and reason
vocabularies are now hand-copied between the backend and `api.ts`, the same
bargain `FORMATS` makes — drift shows up as a 422.

The backend `CLAUDE.md` gains the status-filter rule, the append-only `events`
rule, the durable secret, the router-before-catch-all rule, and loses "every
edit, restore and delete snapshots first" (a hide changes no content, so it
takes no snapshot). The frontend `CLAUDE.md` gains the second entry point and
the FlagPanel's placement. `README.md` gains the `admin.py add` bootstrap and
the warning that a backup without `secret.key` orphans every block.

## Commits

Each one leaves `test_namba.py` and `tsc --noEmit && oxlint src && npm run
build` clean. Nothing is pushed without being asked.

**A — backend**
1. entries have a status, and hidden ones leave the public wiki
2. every write leaves an event behind
3. operators have accounts, readers still do not
4. deleting an entry is a request an operator decides
5. readers can report an entry
6. operators can block a client
7. the admin api serves the dashboard, the content list and diffs

**B — admin UI**
8. its own document, a shell and a login
9. the dashboard
10. the content table, its detail page and the revision diff
11. delete requests and reports
12. abuse, blocked clients and the audit log
13. admin accounts

**C** 14. the docs above
