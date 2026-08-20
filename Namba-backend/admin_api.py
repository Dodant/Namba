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
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

import auth
import db
import events

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
