"""Operator accounts. The only login in the wiki, and readers have none.

Every design decision here is about being the *smallest* auth that is actually
correct, because the alternative is not "no auth" -- an operator's decisions have
to carry a name and be undoable -- but a dependency that brings a password
policy, a reset flow and four tables nobody asked for.

    stdlib scrypt, not bcrypt or passlib   -- hashlib has it, memory-hard, done
    an opaque token, not a JWT             -- logout and deactivation must bite
    the token's sha256 in the table        -- a leaked database is dead tokens
    SameSite=Strict, httponly, no CSRF     -- see set_cookie() below
    no signup route, ever                  -- accounts come from admin.py
"""
import hashlib
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request

import db

SESSION_COOKIE = "namba_admin"
SESSION_DAYS = 14

# scrypt's cost. 128 * r * n is 16 MB of memory per attempt at these numbers,
# which is the point of choosing it: a GPU farm cannot widen that the way it can
# widen a hash. The parameters are stored *in* the hash, so raising them later
# leaves every existing password working -- verify() reads them back.
N, R, P = 2**14, 8, 1
MAXMEM = 64 * 1024 * 1024
DKLEN = 32

# Five a minute, against the write limiter's twenty. The same in-memory
# ponytail as main._writes: per-process, gone on restart, fine for one worker.
_attempts = defaultdict(list)
LOGIN_LIMIT, LOGIN_WINDOW = 5, 60
# When the dict is big enough to be worth emptying of the clients that stopped
# knocking. Nothing expired a key before, only the timestamps inside one.
KEEP_CLIENTS = 10_000


def hash_password(password):
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P,
                         maxmem=MAXMEM, dklen=DKLEN)
    return f"scrypt${N}${R}${P}${salt.hex()}${key.hex()}"


def verify(password, stored):
    """Does this password produce that hash? Never raises -- a stored value this
    cannot parse is a no, not a 500."""
    try:
        kind, n, r, p, salt, want = stored.split("$")
        if kind != "scrypt":
            return False
        key = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt),
                             n=int(n), r=int(r), p=int(p), maxmem=MAXMEM,
                             dklen=len(want) // 2)
    except (ValueError, TypeError):
        return False
    return secrets.compare_digest(key.hex(), want)


# Verified against when the email is unknown, so that a login takes the same
# ~50ms whether or not the address exists. Without it the response time is a
# free answer to "does this person run the wiki".
DUMMY = hash_password(secrets.token_hex(16))


def limit_login(ip_hash):
    cutoff = time.monotonic() - LOGIN_WINDOW
    # the same unbounded-dict sweep main.guard does, written out again rather
    # than shared: auth may not import main (main imports this), and a helper
    # in db.py for two lines about a rate limiter would be a worse home than
    # either. This dict grows a key per address that ever reached the login
    # form, which on a panel only an operator uses is mostly crawlers.
    if len(_attempts) > KEEP_CLIENTS:
        for k in [k for k, v in _attempts.items() if not v or v[-1] <= cutoff]:
            del _attempts[k]
    hits = [t for t in _attempts[ip_hash] if t > cutoff]
    if len(hits) >= LOGIN_LIMIT:
        raise HTTPException(429, "Too many attempts. Wait a minute.")
    hits.append(time.monotonic())
    _attempts[ip_hash] = hits


def _token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(con, admin_id, ip_hash):
    """A new session. Returns the token to put in the cookie -- the only time it
    exists in plaintext anywhere."""
    token = secrets.token_urlsafe(32)
    ends = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
            ).isoformat(timespec="seconds")
    con.execute(
        """INSERT INTO admin_sessions (token_hash, admin_id, created_at, expires_at,
                                       ip_hash) VALUES (?,?,?,?,?)""",
        (_token_hash(token), admin_id, db.now(), ends, ip_hash),
    )
    return token


def session_admin(con, token):
    """Whose session this is, or None.

    The join carries `active = 1`, which is what makes deactivating an account
    take effect on the request after it rather than in a fortnight: there is no
    signature to keep believing, only a row to stop matching.
    """
    if not token:
        return None
    row = con.execute(
        """SELECT a.id, a.email, a.role FROM admin_sessions s
           JOIN admins a ON a.id = s.admin_id AND a.active = 1
           WHERE s.token_hash = ? AND s.expires_at > ?""",
        (_token_hash(token), db.now()),
    ).fetchone()
    return dict(row) if row else None


def end_session(con, token):
    if token:
        con.execute("DELETE FROM admin_sessions WHERE token_hash = ?",
                    (_token_hash(token),))


def set_cookie(response, request, token):
    """Put the session in a cookie the front end cannot read.

    httponly because nothing in the admin app needs the value -- it sends the
    cookie by existing. SameSite=Strict is what stands in for a CSRF token: the
    admin app is same-origin with the API, so nothing legitimate is a
    cross-site request, and the browser will not attach this cookie to one.

    The second layer is `allow_credentials` being off, and **it must stay off**:
    a credentialed cross-origin request against `Access-Control-Allow-Origin: *`
    is refused by the browser before it is sent. That is the whole of what makes
    the wide-open `allow_origins` harmless here, and `test_admin_accounts`
    asserts it.

    This used to claim the second layer was the JSON content type, "since it
    costs a preflight another origin cannot pass". It does cost a preflight and
    the preflight *passes* -- `allow_headers=["*"]` answers `content-type` with
    a 200 for any origin that asks. So that layer never existed. The defence is
    the two above and nothing else, which is worth knowing before anybody
    reaches for `allow_credentials` believing there is one in reserve.

    Secure follows the scheme the request arrived on, so this works on
    http://localhost without a flag and is set in production without one.
    """
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_DAYS * 24 * 3600,
        httponly=True, samesite="strict", path="/",
        secure=request.url.scheme == "https",
    )


def clear_cookie(response):
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="strict")


def require_admin(request: Request, con=Depends(db.get_db)):
    """Every route under /api/admin except the session three depends on this."""
    who = session_admin(con, request.cookies.get(SESSION_COOKIE))
    if who is None:
        raise HTTPException(401, "sign in")
    return who


def require_super(who=Depends(require_admin)):
    if who["role"] != "SUPER_ADMIN":
        raise HTTPException(403, "that needs a super admin")
    return who
