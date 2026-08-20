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
from fastapi import APIRouter, Depends, HTTPException, Request, Response
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
