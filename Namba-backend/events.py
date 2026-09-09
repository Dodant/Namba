"""One row for everything that happened, and the identity behind it.

Two jobs that are really one. `client_of()` answers "who is this request from"
without ever storing an address, and `record()` writes down what they did. The
table is the wiki's activity feed, the operator's audit log and the raw material
for spotting a spammer, which is why they are one table and not three: the
shape is identical and the dashboard would otherwise be a UNION.

Append-only, by convention rather than by trigger -- nothing in this codebase
issues an UPDATE or a DELETE against `events`. That is what makes it an audit
log an operator cannot quietly tidy up after themselves in. It has no foreign
keys for the same reason `revisions` has none: a record of what happened to a
thing has to outlive the thing.
"""
import hashlib
import json
import os
import secrets

import db

# The cookie that keeps one visitor one client across a changed address. Set on
# the document rather than from a middleware, so one page load sets it once
# instead of once per asset. Advisory: clearing it is a click, which is exactly
# why the IP hash is kept beside it.
COOKIE = "namba_cid"
COOKIE_MAX_AGE = 400 * 24 * 3600   # the ceiling Chrome enforces anyway

SECRET_PATH = os.path.join(os.path.dirname(os.path.abspath(db.DB_PATH)), "secret.key")


def _secret():
    """The per-install key the client hashes are salted with.

    Durable on purpose, and not left to an environment variable somebody
    forgets to set: a key that changed on restart would void every stored block
    and orphan every hash in this table without anything failing loudly.
    NAMBA_SECRET wins if it is set -- put it in the environment if the database
    directory is not somewhere you want a key. Otherwise one is written beside
    the database, and **it belongs in the backup with the database**: without it
    the hashes in here stop matching anything.
    """
    env = os.environ.get("NAMBA_SECRET")
    if env:
        return env.encode()
    try:
        # 0600 at creation, not by a chmod afterwards -- the gap between a
        # world-readable file and the fix is the whole problem. O_EXCL so two
        # workers starting together cannot each write a different key: the
        # loser falls through to the read below.
        fd = os.open(SECRET_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "wb") as fh:
            fh.write(secrets.token_hex(32).encode())
    except FileExistsError:
        pass
    with open(SECRET_PATH, "rb") as fh:
        return fh.read().strip()


SECRET = _secret()


def _hash(value):
    """Salted, not bare: the whole IPv4 space is a rainbow table anybody can
    build in an afternoon, and a bare sha256 of an address is the address."""
    return hashlib.sha256(SECRET + b"\x00" + value.encode()).hexdigest()


def client_of(request):
    """Who this request is from, as hashes and no address.

    The raw IP is never stored anywhere -- not in this table, not in the write
    limiter's dict, not in a log line this code writes. The user agent goes the
    same way. The cookie hash is None when there is no cookie rather than the
    hash of "": every visitor without one would otherwise look like the same
    client, which is the opposite of what it is for.
    """
    cid = request.cookies.get(COOKIE)
    return {
        "ip_hash": _hash(request.client.host if request.client else "unknown"),
        "ua_hash": _hash(request.headers.get("user-agent", "")),
        "client_hash": _hash(cid) if cid else None,
    }


def record(con, action, *, client=None, who=None, target_type=None, target_id=None,
           revision_id=None, admin_id=None, **meta):
    """Append one row. Returns its id.

    `admin_id` is what separates the two halves of the table: None is a visitor,
    set is an audit row for an operator's own decision. `who` is the nickname
    that was typed, when there was one -- it is not an identity and is not
    checked, exactly like `posts.author`.
    """
    cur = con.execute(
        """INSERT INTO events (at, action, admin_id, actor, target_type, target_id,
                               revision_id, ip_hash, ua_hash, client_hash, meta)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (db.now(), action, admin_id, who, target_type, target_id, revision_id,
         (client or {}).get("ip_hash"), (client or {}).get("ua_hash"),
         (client or {}).get("client_hash"),
         json.dumps(meta, ensure_ascii=False) if meta else None),
    )
    return cur.lastrowid
