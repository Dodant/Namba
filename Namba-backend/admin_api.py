"""The back office API. Everything under /api/admin.

Its own module rather than more of main.py for two reasons. The catch-all that
serves the front end has to stay the last route in main.py, which makes include
order a rule; and main.py is the wiki's API, which is a different thing from the
operator's. `main.py` imports this and includes the router, so **nothing here
may import main** -- the shared pieces live in `db.py`, `events.py` and
`auth.py` instead.

Three routes are open, because they are how you stop being anonymous: login,
logout and me. Every other route in this file depends on `auth.require_admin`.
"""
import difflib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

import auth
import db
import events
import store

router = APIRouter(prefix="/api/admin", tags=["admin"])


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, con=Depends(db.get_db)):
    """Five attempts a minute per address, and no answer about which addresses
    exist: scrypt runs against a dummy hash when the email is unknown, so the
    request takes the same time either way."""
    who = events.client_of(request)
    auth.limit_login(who["ip_hash"])
    row = con.execute(
        "SELECT id, email, role, password_hash FROM admins WHERE email = ? AND active = 1",
        (body.email.strip(),),
    ).fetchone()
    ok = auth.verify(body.password, row["password_hash"] if row else auth.DUMMY)
    if not (row and ok):
        # One message for both halves. "No such account" is a free directory.
        raise HTTPException(401, "wrong email or password")
    with con:
        token = auth.start_session(con, row["id"], who["ip_hash"])
        con.execute("UPDATE admins SET last_login_at = ? WHERE id = ?",
                    (db.now(), row["id"]))
        events.record(con, "ADMIN_LOGIN", client=who, admin_id=row["id"],
                      target_type="admin", target_id=row["id"])
    auth.set_cookie(response, request, token)
    return {"id": row["id"], "email": row["email"], "role": row["role"]}


@router.post("/logout")
def logout(request: Request, response: Response, con=Depends(db.get_db)):
    """Not gated: signing out of a session that has already expired must not
    need a live one. Deletes the row, so the token is dead server-side and not
    merely forgotten by the browser -- which is the whole reason this is a
    session table and not a JWT."""
    token = request.cookies.get(auth.SESSION_COOKIE)
    who = auth.session_admin(con, token)
    with con:
        auth.end_session(con, token)
        if who:
            events.record(con, "ADMIN_LOGOUT", client=events.client_of(request),
                          admin_id=who["id"], target_type="admin", target_id=who["id"])
    auth.clear_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(who=Depends(auth.require_admin)):
    """What the admin app asks on load to find out whether to draw the login
    screen. 401 is the answer, not an empty body -- there is no anonymous
    version of the back office."""
    return who


# --- the moderation queue -----------------------------------------------
def _page(con, sql, args, limit, offset):
    """A page of rows plus the size of the whole set.

    Two queries rather than a window function: the count is what the pager
    needs and SQLite would compute it per row either way. `sql` must select
    from a single expression the COUNT can be wrapped around.
    """
    total = con.execute(f"SELECT COUNT(*) FROM ({sql})", args).fetchone()[0]
    rows = con.execute(f"{sql} LIMIT ? OFFSET ?", (*args, limit, offset))
    return {"total": total, "rows": [dict(r) for r in rows]}


class DecideIn(BaseModel):
    decision: str = Field(max_length=20)
    note: str = Field(default="", max_length=1000)


@router.get("/delete-requests")
def list_delete_requests(
    status: str = "PENDING",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """The queue. Carries each entry's value, title and current status, because
    a decision made without seeing what it is about is not a decision -- and
    `p.status` here is the reason the join is LEFT: an entry purged from the
    shell leaves its request behind, and the request is still the record."""
    sql = """SELECT r.*, p.value, p.title, p.status AS post_status
             FROM delete_requests r LEFT JOIN posts p ON p.id = r.post_id
             WHERE (? = 'ALL' OR r.status = ?) ORDER BY r.id DESC"""
    return _page(con, sql, (status, status), limit, offset)


@router.post("/delete-requests/{req_id}/decide")
def decide_delete_request(
    req_id: int,
    body: DecideIn,
    request: Request,
    who=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """Approve and the entry is hidden as DELETED; reject and it stays, with the
    reason recorded. Either way the row keeps who decided and why -- a queue
    that forgets its own decisions is a queue you argue with twice.
    """
    if body.decision not in ("APPROVE", "REJECT"):
        raise HTTPException(422, "decision must be APPROVE or REJECT")
    row = con.execute("SELECT * FROM delete_requests WHERE id = ?", (req_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "no such request")
    if row["status"] != "PENDING":
        raise HTTPException(409, f"already {row['status'].lower()}")

    approve = body.decision == "APPROVE"
    client = events.client_of(request)
    with con:
        con.execute(
            """UPDATE delete_requests SET status = ?, decided_at = ?, decided_by = ?,
                                          decision_note = ? WHERE id = ?""",
            ("APPROVED" if approve else "REJECTED", db.now(), who["id"],
             body.note.strip(), req_id),
        )
        if approve:
            # No snapshot: the entry's content did not change, only whether the
            # wiki shows it, and putting it back is the same one column.
            con.execute("UPDATE posts SET status = 'DELETED' WHERE id = ?",
                        (row["post_id"],))
            # Every other pending request on this entry is asking for what has
            # just happened. Leaving them open would show five rows for one
            # decision already made. A rejection closes only its own row: that
            # one was about its own reason.
            con.execute(
                """UPDATE delete_requests SET status = 'APPROVED', decided_at = ?,
                       decided_by = ?, decision_note = ?
                   WHERE post_id = ? AND status = 'PENDING'""",
                (db.now(), who["id"], f"decided with request {req_id}", row["post_id"]),
            )
            events.record(con, "CONTENT_DELETE", client=client, admin_id=who["id"],
                          target_type="post", target_id=row["post_id"],
                          request=req_id, note=body.note.strip())
        events.record(con, "REQUEST_APPROVE" if approve else "REQUEST_REJECT",
                      client=client, admin_id=who["id"], target_type="request",
                      target_id=req_id, post=row["post_id"], note=body.note.strip())
    return {"id": req_id, "status": "APPROVED" if approve else "REJECTED"}


@router.get("/reports")
def list_reports(
    status: str = "OPEN",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """One row per entry, not per report: five people objecting to one entry is
    one thing to look at. Carries the count, the first and the last time, and
    the reasons given, which is what §5 of the brief asks the page to show."""
    sql = """SELECT r.post_id, p.value, p.title, p.status AS post_status,
                    COUNT(*) AS reports, MIN(r.created_at) AS first_at,
                    MAX(r.created_at) AS last_at,
                    GROUP_CONCAT(DISTINCT r.reason) AS reasons,
                    MIN(r.id) AS lead_id
             FROM reports r LEFT JOIN posts p ON p.id = r.post_id
             WHERE (? = 'ALL' OR r.status = ?)
             GROUP BY r.post_id ORDER BY reports DESC, last_at DESC"""
    return _page(con, sql, (status, status), limit, offset)


@router.get("/reports/{post_id}/detail")
def report_detail(
    post_id: int, _=Depends(auth.require_admin), con=Depends(db.get_db)
):
    """Every report filed against one entry, so the grouped row above can be
    opened. The client hashes come with them: the same hash on four entries is
    the difference between a problem and a campaign."""
    return [dict(r) for r in con.execute(
        "SELECT * FROM reports WHERE post_id = ? ORDER BY id DESC", (post_id,))]


@router.post("/reports/{post_id}/decide")
def decide_reports(
    post_id: int,
    body: DecideIn,
    request: Request,
    who=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """Closes every open report on one entry at once, because that is the unit
    the page shows and the unit the operator actually decides.

    Deliberately does nothing to the entry. Hiding it, editing it or blocking
    whoever wrote it are their own routes with their own audit rows -- folding
    them in here would make one button that does four things and logs one.
    """
    if body.decision not in ("RESOLVE", "IGNORE"):
        raise HTTPException(422, "decision must be RESOLVE or IGNORE")
    state = "RESOLVED" if body.decision == "RESOLVE" else "IGNORED"
    with con:
        cur = con.execute(
            """UPDATE reports SET status = ?, decided_at = ?, decided_by = ?,
                   decision_note = ? WHERE post_id = ? AND status = 'OPEN'""",
            (state, db.now(), who["id"], body.note.strip(), post_id),
        )
        if cur.rowcount:
            events.record(con, "REPORT_RESOLVE" if state == "RESOLVED"
                          else "REPORT_IGNORE", client=events.client_of(request),
                          admin_id=who["id"], target_type="post", target_id=post_id,
                          closed=cur.rowcount, note=body.note.strip())
    if not cur.rowcount:
        raise HTTPException(404, "no open reports on that entry")
    return {"post_id": post_id, "status": state, "closed": cur.rowcount}


# --- blocked clients ----------------------------------------------------
class BlockIn(BaseModel):
    type: str = Field(max_length=10)
    target_hash: str = Field(min_length=16, max_length=64)
    reason: str = Field(default="", max_length=200)
    # None is permanent, and has to be sent as such rather than being the
    # default: a block nobody chose the length of should not be the forever one.
    hours: Optional[int] = Field(default=24, ge=1, le=24 * 365 * 10)


@router.get("/blocks")
def list_blocks(
    live: bool = True,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """Lifted and expired ones are still here and still readable, which is the
    point of `lifted_at` -- "we blocked this and let it back in" is something an
    operator needs to be able to look up."""
    sql = """SELECT b.*, a.email AS by,
                    (b.lifted_at IS NULL
                     AND (b.expires_at IS NULL OR b.expires_at > ?)) AS live
             FROM blocks b LEFT JOIN admins a ON a.id = b.created_by
             WHERE (? = 0 OR (b.lifted_at IS NULL
                    AND (b.expires_at IS NULL OR b.expires_at > ?)))
             ORDER BY b.id DESC"""
    return _page(con, sql, (db.now(), int(live), db.now()), limit, offset)


@router.post("/blocks", status_code=201)
def add_block(
    body: BlockIn,
    request: Request,
    who=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """The hash comes from the abuse view or from a report's detail -- there is
    nowhere else to get one, which is deliberate: an operator blocks something
    they have just been looking at the record of."""
    if body.type not in db.BLOCK_TYPES:
        raise HTTPException(422, f"type must be one of {db.BLOCK_TYPES}")
    ends = None
    if body.hours is not None:
        ends = (datetime.now(timezone.utc)
                + timedelta(hours=body.hours)).isoformat(timespec="seconds")
    with con:
        cur = con.execute(
            """INSERT INTO blocks (type, target_hash, reason, created_at, created_by,
                                   expires_at) VALUES (?,?,?,?,?,?)""",
            (body.type, body.target_hash, body.reason.strip(), db.now(), who["id"],
             ends),
        )
        events.record(con, "CLIENT_BLOCK", client=events.client_of(request),
                      admin_id=who["id"], target_type="block",
                      target_id=cur.lastrowid, kind=body.type,
                      target=body.target_hash[:8], hours=body.hours,
                      reason=body.reason.strip())
    return {"id": cur.lastrowid, "expires_at": ends}


@router.post("/blocks/{block_id}/lift")
def lift_block(
    block_id: int,
    request: Request,
    who=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    with con:
        cur = con.execute(
            """UPDATE blocks SET lifted_at = ?, lifted_by = ?
               WHERE id = ? AND lifted_at IS NULL""",
            (db.now(), who["id"], block_id),
        )
        if cur.rowcount:
            events.record(con, "CLIENT_UNBLOCK", client=events.client_of(request),
                          admin_id=who["id"], target_type="block",
                          target_id=block_id)
    if not cur.rowcount:
        raise HTTPException(404, "no live block with that id")
    return {"id": block_id, "lifted": True}


# --- the dashboard ------------------------------------------------------
def _since(minutes):
    return (datetime.now(timezone.utc)
            - timedelta(minutes=minutes)).isoformat(timespec="seconds")


@router.get("/stats")
def stats(_=Depends(auth.require_admin), con=Depends(db.get_db)):
    """Everything the dashboard shows, as one request of scalar queries.

    ponytail: eight counts on every load of one page by one operator. At this
    size they are microseconds; cache them in a table if the wiki ever gets big
    enough for that to be untrue.

    "Today" is UTC, because every timestamp in the database is
    (`db.now()`), and an operator reading "3 created today" wants it to agree
    with the dates in the table beside it rather than with their own clock.
    """
    def one(sql, *args):
        return con.execute(sql, args).fetchone()[0]

    return {
        # a number is a column, not a table, so "how many numbers" is a DISTINCT
        # over the pair that makes a page -- /n/42 as an INTEGER and 42 as a
        # TIME are two rows on the index
        "numbers": one("""SELECT COUNT(DISTINCT value || '/' || format) FROM posts
                          WHERE status = 'ACTIVE'"""),
        "entries": one("SELECT COUNT(*) FROM posts WHERE status = 'ACTIVE'"),
        "hidden": one("SELECT COUNT(*) FROM posts WHERE status <> 'ACTIVE'"),
        "created_today": one("""SELECT COUNT(*) FROM posts
                                WHERE substr(created_at, 1, 10) = date('now')"""),
        # rewritten today, not written today: an entry created an hour ago has
        # not been edited, and counting it in both would double every new entry
        "edited_today": one("""SELECT COUNT(*) FROM posts
                               WHERE substr(updated_at, 1, 10) = date('now')
                                 AND updated_at <> created_at"""),
        "requests_pending": one("""SELECT COUNT(*) FROM delete_requests
                                   WHERE status = 'PENDING'"""),
        "reports_open": one("SELECT COUNT(*) FROM reports WHERE status = 'OPEN'"),
        "edits_24h": one("""SELECT COUNT(*) FROM events
                            WHERE action IN ('EDIT', 'RESTORE') AND at > ?""",
                         _since(24 * 60)),
        "writes_1h": one("SELECT COUNT(*) FROM events WHERE admin_id IS NULL AND at > ?",
                         _since(60)),
        "blocked": one("""SELECT COUNT(*) FROM blocks WHERE lifted_at IS NULL
                            AND (expires_at IS NULL OR expires_at > ?)""", db.now()),
        "comments": one("SELECT COUNT(*) FROM comments"),
    }


@router.get("/activity")
def activity(
    kind: str = "all",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """The recent-activity list, and with kind=admin the audit log -- the same
    rows read two ways, which is the whole reason `events` is one table.

    Both joins are LEFT: an audit row outlives the entry it is about and the
    account that made it, and this is exactly the page where somebody goes
    looking for one that does."""
    where = {"all": "1", "anon": "e.admin_id IS NULL",
             "admin": "e.admin_id IS NOT NULL"}.get(kind)
    if where is None:
        raise HTTPException(422, "kind must be all, anon or admin")
    sql = f"""SELECT e.*, a.email AS by, p.value, p.title, p.status AS post_status
              FROM events e
              LEFT JOIN admins a ON a.id = e.admin_id
              LEFT JOIN posts p ON p.id = e.target_id AND e.target_type = 'post'
              WHERE {where} ORDER BY e.id DESC"""
    return _page(con, sql, (), limit, offset)


# --- content ------------------------------------------------------------
@router.get("/posts")
def list_all_posts(
    q: Optional[str] = None,
    status: str = "ALL",
    flagged: bool = False,
    sort: str = "updated",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """The content table. Hidden entries included -- this is the one list in the
    codebase that does not carry `store.LIVE`, which is the point of it.

    FLAGGED is not a stored status and deliberately never will be: it means "has
    an open report", `reports` is already the truth for that, and a column would
    go stale the moment one was resolved. The count comes back instead and the
    badge is drawn from it.
    """
    where, args = [], []
    if status != "ALL":
        if status not in db.POST_STATUSES:
            raise HTTPException(422, f"status must be ALL or one of {db.POST_STATUSES}")
        where.append("p.status = ?")
        args.append(status)
    if q:
        where.append("(p.title LIKE ? OR p.body LIKE ? OR p.value LIKE ?)")
        args += [f"%{q}%"] * 3
    if flagged:
        where.append("open_reports > 0")
    order = {
        "updated": "p.updated_at DESC, p.id DESC",
        "created": "p.created_at DESC, p.id DESC",
        "reports": "open_reports DESC, pending_requests DESC, p.id DESC",
        "number": "p.sort_key IS NULL, p.sort_key, p.value, p.id",
    }.get(sort, "p.updated_at DESC, p.id DESC")
    sql = f"""SELECT p.id, p.value, p.format, p.grouped, p.title, p.status, p.author,
                     p.edited_by, p.likes, p.created_at, p.updated_at,
                     (SELECT COUNT(*) FROM reports r
                      WHERE r.post_id = p.id AND r.status = 'OPEN') AS open_reports,
                     (SELECT COUNT(*) FROM delete_requests d
                      WHERE d.post_id = p.id AND d.status = 'PENDING') AS pending_requests
              FROM posts p
              {"WHERE " + " AND ".join(where) if where else ""}
              ORDER BY {order}"""
    return _page(con, sql, tuple(args), limit, offset)


@router.get("/posts/{post_id}")
def one_post(post_id: int, _=Depends(auth.require_admin), con=Depends(db.get_db)):
    """The entry whatever its status, with what is attached to it. hidden=True is
    what this route is for -- it is the only read in the codebase that passes it."""
    post = store.fetch_one(con, post_id, hidden=True)
    post["comments"] = [dict(r) for r in con.execute(
        "SELECT * FROM comments WHERE post_id = ? ORDER BY id DESC", (post_id,))]
    post["reports"] = [dict(r) for r in con.execute(
        "SELECT * FROM reports WHERE post_id = ? ORDER BY id DESC", (post_id,))]
    post["requests"] = [dict(r) for r in con.execute(
        "SELECT * FROM delete_requests WHERE post_id = ? ORDER BY id DESC", (post_id,))]
    post["revision_count"] = con.execute(
        "SELECT COUNT(*) FROM revisions WHERE post_id = ?", (post_id,)).fetchone()[0]
    return post


@router.get("/posts/{post_id}/revisions")
def all_revisions(post_id: int, _=Depends(auth.require_admin), con=Depends(db.get_db)):
    """Every revision, uncapped -- the public route ships the newest fifty
    because a snapshot is the whole entry and the edit form opens with the list;
    here it is the page and an entry fought over is exactly the one to look at.

    The snapshots do not come with it. They are read to pull the title out as a
    label and then dropped: fifty whole entries is megabytes, and the diff route
    below fetches the two that are actually being looked at. `revision_number`
    is the position in this list, not a column -- it only means anything in the
    order it is read in.

    The event beside each one is what turns "someone" into an action and a
    client hash. LEFT, because revisions written before `events` existed have
    no row, and they are the oldest history there is.
    """
    rows = con.execute(
        """SELECT r.id, r.author, r.at, r.snapshot, e.action, e.ip_hash,
                  e.client_hash, e.admin_id, a.email AS by
           FROM revisions r
           LEFT JOIN events e ON e.revision_id = r.id
           LEFT JOIN admins a ON a.id = e.admin_id
           WHERE r.post_id = ? ORDER BY r.id DESC""",
        (post_id,),
    ).fetchall()
    out = []
    for i, r in enumerate(rows):
        snap = json.loads(r["snapshot"])
        out.append({
            "id": r["id"], "number": len(rows) - i, "author": r["author"],
            "at": r["at"], "action": r["action"] or "EDIT", "ip_hash": r["ip_hash"],
            "client_hash": r["client_hash"], "admin_id": r["admin_id"], "by": r["by"],
            "title": snap.get("title"), "value": snap.get("value"),
        })
    return out


DIFF_FIELDS = ("value", "format", "title", "lang", "grouped", "image", "author",
               "edited_by")


def _state(con, post_id, ref):
    """One side of a diff: a revision id, or "live" for the entry as it stands."""
    if ref == "live":
        return store.fetch_one(con, post_id, hidden=True)
    if not ref.isdigit():
        raise HTTPException(422, "a side of a diff is a revision id or 'live'")
    row = con.execute("SELECT snapshot FROM revisions WHERE id = ? AND post_id = ?",
                      (int(ref), post_id)).fetchone()
    if row is None:
        raise HTTPException(404, "no such revision for that entry")
    return json.loads(row["snapshot"])


@router.get("/posts/{post_id}/diff")
def diff(
    post_id: int,
    a: str,
    b: str = "live",
    _=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """What changed between two versions.

    Fields and body are answered separately on purpose. A changed sort key or a
    flipped `grouped` inside a unified text diff is unreadable, and the thing an
    operator is usually looking for -- "the number was quietly changed" -- is a
    field, not a line. difflib because it is stdlib; a JS diff library on the
    other side of the wire would be a dependency for what this already does.
    """
    was, now_ = _state(con, post_id, a), _state(con, post_id, b)
    fields = [{"name": f, "before": was.get(f), "after": now_.get(f)}
              for f in DIFF_FIELDS if was.get(f) != now_.get(f)]
    body = []
    lines = difflib.unified_diff(
        (was.get("body") or "").splitlines(), (now_.get("body") or "").splitlines(),
        lineterm="", n=2,
    )
    for line in lines:
        if line.startswith(("---", "+++")):
            continue   # file headers; there are no files here
        body.append({"sign": line[:1] if line[:1] in "-+@" else " ",
                     "text": line[1:] if line[:1] in "-+ " else line})
    return {
        "a": a, "b": b, "fields": fields, "body": body,
        "tags": {"before": was.get("tags", []), "after": now_.get("tags", [])},
        "translations": {"before": [t["lang"] for t in was.get("translations") or []],
                         "after": [t["lang"] for t in now_.get("translations") or []]},
    }


class StatusIn(BaseModel):
    status: str = Field(max_length=20)
    note: str = Field(default="", max_length=1000)


@router.post("/posts/{post_id}/status")
def set_post_status(
    post_id: int,
    body: StatusIn,
    request: Request,
    who=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """Hide an entry, mark it removed, or put it back.

    No snapshot: the entry's content did not change, only whether the wiki shows
    it, and the undo is this same route with ACTIVE. That is why moderation here
    is reversible without costing anything -- there is nothing to recover.
    """
    if body.status not in db.POST_STATUSES:
        raise HTTPException(422, f"status must be one of {db.POST_STATUSES}")
    was = store.fetch_one(con, post_id, hidden=True)
    if was["status"] == body.status:
        raise HTTPException(409, f"already {body.status}")
    action = {"ACTIVE": "CONTENT_RESTORE", "HIDDEN": "CONTENT_HIDE",
              "DELETED": "CONTENT_DELETE"}[body.status]
    with con:
        con.execute("UPDATE posts SET status = ? WHERE id = ?", (body.status, post_id))
        events.record(con, action, client=events.client_of(request),
                      admin_id=who["id"], target_type="post", target_id=post_id,
                      was=was["status"], note=body.note.strip())
    return {"id": post_id, "status": body.status, "was": was["status"]}


class AdminRestoreIn(BaseModel):
    note: str = Field(default="", max_length=1000)


@router.post("/posts/{post_id}/revisions/{rev_id}/restore")
def admin_restore(
    post_id: int,
    rev_id: int,
    body: AdminRestoreIn,
    request: Request,
    who=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """Put a revision back, credited to the operator and recorded as theirs.

    The public route does this too and cannot reach a hidden entry -- which is
    the case an operator has, since an entry worth reverting is often one they
    took down first. Restoring takes its own snapshot before it writes, so this
    is undoable like every other edit, which is the rule the brief asks for:
    never overwrite a revision, always add one.
    """
    row = con.execute("SELECT snapshot FROM revisions WHERE id = ? AND post_id = ?",
                      (rev_id, post_id)).fetchone()
    if row is None:
        raise HTTPException(404, "no such revision for that entry")
    old = json.loads(row["snapshot"])
    label = f"operator {who['email']}"
    with con:
        rev = store.snapshot(con, post_id, label, hidden=True)
        con.execute(
            """UPDATE posts SET value=?, format=?, sort_key=?, title=?, body=?,
                                image=?, lang=?, grouped=?, edited_by=?, updated_at=?
               WHERE id=?""",
            (old["value"], old["format"], old["sort_key"], old["title"], old["body"],
             old["image"], old.get("lang"), int(old.get("grouped") or 0), label,
             db.now(), post_id),
        )
        store.write_tags(con, post_id, old.get("tags", []))
        store.write_translations(con, post_id, old.get("translations", []))
        events.record(con, "CONTENT_REVERT", client=events.client_of(request),
                      admin_id=who["id"], target_type="post", target_id=post_id,
                      revision_id=rev, restored=rev_id, note=body.note.strip())
    return store.fetch_one(con, post_id, hidden=True)


# --- abuse --------------------------------------------------------------
@router.get("/abuse")
def abuse(
    minutes: int = Query(default=60, ge=1, le=60 * 24 * 30),
    least: int = Query(default=5, ge=1, le=1000),
    _=Depends(auth.require_admin),
    con=Depends(db.get_db),
):
    """Who has been writing a lot lately, and what a lot looks like.

    Grouped by IP hash and not by cookie: a cookie is cleared in a click, and the
    view an operator wants is "this address" rather than "this browser session".
    The cookie hashes come along so a block can be aimed at whichever is the
    tighter fit.

    ponytail: this is counting, not detection. The four patterns the brief names
    that counting cannot see -- the same entry rewritten in a loop, the same
    text posted under many numbers, a campaign spread over a day -- are what the
    `duplicates` half below starts on and what a scoring pass would finish. The
    shape is here for it: one row per client per window, and every write already
    in `events`.
    """
    since = _since(minutes)
    rows = con.execute(
        """SELECT ip_hash,
                  COUNT(*) AS writes,
                  COUNT(DISTINCT client_hash) AS browsers,
                  COUNT(DISTINCT target_id) AS targets,
                  SUM(action = 'CREATE') AS creates,
                  SUM(action = 'EDIT') AS edits,
                  SUM(action = 'COMMENT') AS comments,
                  SUM(action = 'DELETE_REQUEST') AS requests,
                  SUM(action = 'REPORT') AS reports,
                  SUM(action = 'UPLOAD') AS uploads,
                  MIN(at) AS first_at, MAX(at) AS last_at,
                  MAX(client_hash) AS a_client,
                  EXISTS (SELECT 1 FROM blocks b
                          WHERE b.target_hash = events.ip_hash
                            AND b.lifted_at IS NULL
                            AND (b.expires_at IS NULL OR b.expires_at > ?)) AS blocked
           FROM events
           WHERE admin_id IS NULL AND at > ? AND ip_hash IS NOT NULL
           GROUP BY ip_hash HAVING writes >= ?
           ORDER BY writes DESC""",
        (db.now(), since, least),
    )
    # The one pattern a query answers outright: the same words filed under many
    # numbers, which is what an advert looks like on a wiki about numbers.
    dupes = con.execute(
        """SELECT title, COUNT(*) AS entries, GROUP_CONCAT(id) AS ids
           FROM posts WHERE status = 'ACTIVE' AND length(title) > 3
           GROUP BY lower(title) HAVING entries > 2
           ORDER BY entries DESC LIMIT 25"""
    )
    return {"since": since, "minutes": minutes,
            "clients": [dict(r) for r in rows],
            "duplicates": [dict(r) for r in dupes]}


# --- operator accounts --------------------------------------------------
class AdminIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=12, max_length=200)
    role: str = "ADMIN"


@router.get("/admins")
def list_admins(_=Depends(auth.require_admin), con=Depends(db.get_db)):
    """Readable by any operator: who else can act here is not a secret from the
    people who can act here. Changing the list needs a super admin."""
    return [dict(r) for r in con.execute(
        """SELECT id, email, role, active, created_at, last_login_at
           FROM admins ORDER BY id""")]


@router.post("/admins", status_code=201)
def add_admin_route(
    body: AdminIn,
    request: Request,
    who=Depends(auth.require_super),
    con=Depends(db.get_db),
):
    """The one way to make an account that is not a shell. Still not a signup:
    it needs a super admin's live session, and there is no route a visitor can
    reach that creates anything here."""
    if body.role not in ("ADMIN", "SUPER_ADMIN"):
        raise HTTPException(422, "role must be ADMIN or SUPER_ADMIN")
    if "@" not in body.email:
        raise HTTPException(422, "that does not look like an email address")
    try:
        with con:
            cur = con.execute(
                """INSERT INTO admins (email, password_hash, role, created_at)
                   VALUES (?,?,?,?)""",
                (body.email.strip(), auth.hash_password(body.password), body.role,
                 db.now()),
            )
            events.record(con, "ADMIN_CREATE", client=events.client_of(request),
                          admin_id=who["id"], target_type="admin",
                          target_id=cur.lastrowid, email=body.email.strip(),
                          role=body.role)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "that address already has an account") from None
    return {"id": cur.lastrowid, "email": body.email.strip(), "role": body.role}


class ActiveIn(BaseModel):
    active: bool


@router.post("/admins/{admin_id}/active")
def set_admin_active(
    admin_id: int,
    body: ActiveIn,
    request: Request,
    who=Depends(auth.require_super),
    con=Depends(db.get_db),
):
    """Revoke or restore an account, never delete one: every audit row points at
    an id here.

    One refusal, and it is the only one needed: you cannot revoke your own
    account here. That is also what keeps a live super admin in existence --
    require_super means whoever is asking is one, so revoking anybody *else*
    always leaves at least them. A separate "not the last super admin" check
    would read as protection and could never fire.

    Locking the door from the outside stays possible from a shell, which is the
    right place for it: `admin.py deactivate` will revoke the last account, and
    `admin.py add` is how you get back in.
    """
    row = con.execute("SELECT id, email, role, active FROM admins WHERE id = ?",
                      (admin_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "no such account")
    if not body.active and admin_id == who["id"]:
        raise HTTPException(409, "you cannot revoke your own account here")
    with con:
        con.execute("UPDATE admins SET active = ? WHERE id = ?",
                    (int(body.active), admin_id))
        if not body.active:
            con.execute("DELETE FROM admin_sessions WHERE admin_id = ?", (admin_id,))
        events.record(con, "ADMIN_ACTIVE" if body.active else "ADMIN_DEACTIVATE",
                      client=events.client_of(request), admin_id=who["id"],
                      target_type="admin", target_id=admin_id, email=row["email"])
    return {"id": admin_id, "active": body.active}
