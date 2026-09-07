"""Operator commands.  python admin.py <command> [args]

    status <id>              what the wiki is showing for this entry
    hide <id>                take it off the public wiki
    show <id>                put it back
    purge <id> --yes         the one hard delete there is -- see below

    admins                   who can sign in to the back office
    add <email> [--super]    create an operator; prompts for the password
    passwd <email>           change one
    totp-enroll <email>      add or replace the authenticator app key
    deactivate <email>       revoke the account and kill its live sessions
    activate <email>

Hiding is what moderation means here. The row stays, every public read skips it,
and `show` brings the entry back whole: its history, its translations, the talk
beside it. No API route removes a row, so nothing an operator does through the
back office is unrecoverable.

`purge` is the exception, and it is a shell command rather than a route because
whoever holds shell access *is* the operator and there is nobody to rate-limit.
It is for the removal a law requires -- a phone number, an address, a face. An
edit cannot do that job: snapshot() copies the old body into `revisions` and
/api/posts/{id}/revisions serves it to anyone, so blanking a field only moves
the data one click away. A purge takes the entry, its snapshots and its picture
together, and the ON DELETE CASCADE on post_tags, post_links, translations and
comments is what earns its keep here.

The account commands are here for the same reason and not as a convenience:
**there is no signup route.** The back office has a login and nothing that
creates a login, so the first operator can only come from a shell, and every one
after that from here or from another operator inside the panel. A password is
never taken from argv -- it would sit in the shell history -- so these prompt.

The first account created is a SUPER_ADMIN whatever the flags say. Otherwise
nobody could ever make the second one from inside the panel.
"""
import getpass
import os
import sqlite3
import sys
from urllib.parse import quote

import auth
import db
import events
import gc_uploads
from main import UPLOAD_DIR

PASSWORD_MIN = 12


def status_of(post_id):
    con = db.connect()
    try:
        row = con.execute("SELECT status, title FROM posts WHERE id = ?",
                          (post_id,)).fetchone()
    finally:
        con.close()
    if row is None:
        raise LookupError(f"no entry {post_id}")
    return row["status"], row["title"]


def set_status(post_id, status):
    """Move an entry on or off the public wiki. Reversible by definition: the
    only thing that changes is a string in one column."""
    if status not in db.POST_STATUSES:
        raise ValueError(f"status must be one of {db.POST_STATUSES}")
    con = db.connect()
    try:
        with con:
            cur = con.execute("UPDATE posts SET status = ? WHERE id = ?",
                              (status, post_id))
    finally:
        con.close()
    if not cur.rowcount:
        raise LookupError(f"no entry {post_id}")
    return status


def purge(post_id):
    """Remove an entry, its history and its picture. Not reversible.

    Returns the picture filename if one was removed, else None.

    **What it does not take is the entry's rows in `events`.** They keep the
    nickname that was typed, the three salted hashes behind each write, and
    whatever `meta` was worth reading -- so a purge run for a legal removal
    leaves that much behind. Deliberate, not missed: `events` is append-only by
    convention (see its module docstring), and nothing in this codebase issues
    an UPDATE or a DELETE against it, which is the whole reason an operator
    cannot quietly tidy up after themselves in it. Redacting the identity
    columns here would close the gap and spend that guarantee, and on a wiki
    this size the guarantee is worth more. If a removal ever has to reach them,
    it is a decision to take in the open -- the exception goes in the docstring
    and in CLAUDE.md first, the way the reader-accounts line was revised.
    """
    con = db.connect()
    try:
        row = con.execute("SELECT image FROM posts WHERE id = ?", (post_id,)).fetchone()
        if row is None:
            raise LookupError(f"no entry {post_id}")
        with con:
            # The snapshots go first and by hand. No foreign key holds them --
            # which is exactly what lets them survive a hide, and exactly why a
            # bare DELETE FROM posts leaves behind the body a purge was for.
            con.execute("DELETE FROM revisions WHERE post_id = ?", (post_id,))
            con.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        # The picture goes only once nothing names it any more: a body can carry
        # the same path in markdown, and so can another entry's snapshot.
        # referenced() is asked *after* the delete, so it answers about what is
        # left. Same rule gc_uploads.py works by, and the same function.
        name = os.path.basename(row["image"] or "")
        if name and name not in gc_uploads.referenced(con):
            path = os.path.join(UPLOAD_DIR, name)
            if os.path.isfile(path):
                os.remove(path)
                return name
    finally:
        con.close()
    return None


def admins():
    """Everyone who can sign in, with the last time they did."""
    con = db.connect()
    try:
        return [dict(r) for r in con.execute(
            """SELECT id, email, role, active, created_at, last_login_at,
                      (totp_generation IS NOT NULL) AS totp_enabled
               FROM admins ORDER BY id""")]
    finally:
        con.close()


def add_admin(email, password, role="ADMIN"):
    """Create an operator. The first one is a SUPER_ADMIN regardless: with no
    signup route and no super admin, nobody could ever create the second."""
    email = email.strip()
    if "@" not in email:
        raise ValueError("that does not look like an email address")
    if len(password) < PASSWORD_MIN:
        raise ValueError(f"at least {PASSWORD_MIN} characters")
    con = db.connect()
    try:
        first = not con.execute("SELECT 1 FROM admins LIMIT 1").fetchone()
        with con:
            cur = con.execute(
                """INSERT INTO admins (email, password_hash, role, created_at)
                   VALUES (?,?,?,?)""",
                (email, auth.hash_password(password),
                 "SUPER_ADMIN" if first or role == "SUPER_ADMIN" else "ADMIN",
                 db.now()),
            )
            events.record(con, "ADMIN_CREATE", target_type="admin",
                          target_id=cur.lastrowid, email=email, by="shell")
    except sqlite3.IntegrityError:
        raise ValueError(f"{email} already has an account") from None
    finally:
        con.close()
    return cur.lastrowid, first


def set_password(email, password):
    if len(password) < PASSWORD_MIN:
        raise ValueError(f"at least {PASSWORD_MIN} characters")
    con = db.connect()
    try:
        with con:
            cur = con.execute("UPDATE admins SET password_hash = ? WHERE email = ?",
                              (auth.hash_password(password), email.strip()))
            if cur.rowcount:
                # Every live session goes with it. A password change that leaves
                # the old cookie working is not a password change.
                con.execute(
                    """DELETE FROM admin_sessions WHERE admin_id IN
                         (SELECT id FROM admins WHERE email = ?)""", (email.strip(),))
                events.record(con, "ADMIN_PASSWORD", target_type="admin", by="shell")
    finally:
        con.close()
    if not cur.rowcount:
        raise LookupError(f"no account for {email}")


def totp_enrollment(email):
    """Describe the next enrollment without changing the working one.

    The caller shows the key first and only commits it after a code proves the
    authenticator app received it. Losing a terminal halfway through setup must
    not replace a key that still works.
    """
    email = email.strip()
    con = db.connect()
    try:
        row = con.execute(
            "SELECT id, email, totp_generation FROM admins WHERE email = ?",
            (email,),
        ).fetchone()
    finally:
        con.close()
    if row is None:
        raise LookupError(f"no account for {email}")
    generation = (row["totp_generation"] or 0) + 1
    key = auth.totp_setup_key(row["id"], generation)
    label = quote(f"Namba:{row['email']}", safe="")
    uri = (
        f"otpauth://totp/{label}?secret={key}&issuer=Namba"
        f"&algorithm=SHA1&digits={auth.TOTP_DIGITS}&period={auth.TOTP_STEP}"
    )
    return {"admin_id": row["id"], "email": row["email"],
            "generation": generation, "key": key, "uri": uri}


def enable_totp(email, generation, code):
    """Commit an enrollment after its first current code has been checked."""
    email = email.strip()
    con = db.connect()
    try:
        row = con.execute(
            "SELECT id, totp_generation FROM admins WHERE email = ?", (email,),
        ).fetchone()
        if row is None:
            raise LookupError(f"no account for {email}")
        expected = (row["totp_generation"] or 0) + 1
        if generation != expected:
            raise ValueError("that enrollment was replaced; start again")
        counter = auth.match_totp(row["id"], generation, code)
        if counter is None:
            raise ValueError("that authenticator code is not current")
        with con:
            cur = con.execute(
                """UPDATE admins
                   SET totp_generation = ?, totp_last_counter = ?
                   WHERE id = ? AND coalesce(totp_generation, 0) = ?""",
                (generation, counter, row["id"], generation - 1),
            )
            if not cur.rowcount:
                raise ValueError("that enrollment was replaced; start again")
            con.execute("DELETE FROM admin_sessions WHERE admin_id = ?", (row["id"],))
            con.execute("DELETE FROM admin_login_challenges WHERE admin_id = ?",
                        (row["id"],))
            events.record(con, "ADMIN_TOTP_ENROLL", target_type="admin",
                          target_id=row["id"], email=email, by="shell")
    finally:
        con.close()
    return generation


def set_active(email, active):
    """Revoke or restore an account. Never a DELETE: every audit row points at
    an id here, and an operator who leaves must not take their record along."""
    con = db.connect()
    try:
        with con:
            cur = con.execute("UPDATE admins SET active = ? WHERE email = ?",
                              (int(active), email.strip()))
            if cur.rowcount and not active:
                con.execute(
                    """DELETE FROM admin_sessions WHERE admin_id IN
                         (SELECT id FROM admins WHERE email = ?)""", (email.strip(),))
            if cur.rowcount:
                events.record(con, "ADMIN_ACTIVE" if active else "ADMIN_DEACTIVATE",
                              target_type="admin", email=email.strip(), by="shell")
    finally:
        con.close()
    if not cur.rowcount:
        raise LookupError(f"no account for {email}")


def _ask_password():
    """Twice from a terminal, once from a pipe, never from argv.

    argv stays refused: a password on a command line is a password in the shell
    history, for as long as that file lives. The other two are both real.

    A terminal is the normal case, and getpass hides the typing. A pipe is the
    case this was written for after the fact -- provisioning an operator over
    `docker exec`, from a deploy script, or through a shell with no tty at all,
    where getpass cannot turn echo off and raises `termios.error` and then
    EOFError on top of it. It used to do exactly that and print a traceback
    instead of saying what was wrong.

    Whatever feeds the pipe owns the question of where the password came from;
    the note below says so, because a pipe *does* put it in the history that a
    terminal does not.
    """
    if sys.stdin.isatty():
        first = getpass.getpass("password: ")
        if first != getpass.getpass("again: "):
            raise SystemExit("they did not match")
        return first
    piped = sys.stdin.readline().rstrip("\n")
    if not piped:
        raise SystemExit(
            "There is no terminal here to ask on, and nothing arrived on stdin.\n"
            "\n"
            "Run it in a real terminal:\n"
            "    .venv/bin/python admin.py add you@example.com\n"
            "\n"
            "...or pipe the password in, if you have nowhere better:\n"
            "    printf '%s\\n' 'the password' | .venv/bin/python admin.py add "
            "you@example.com\n"
            "\n"
            "A pipe puts it wherever your shell keeps its history. A terminal "
            "does not,\nwhich is why that is the first suggestion and not the "
            "second."
        )
    return piped


if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = args[0] if args else ""
    rest = args[1:]
    try:
        if cmd == "admins":
            for a in admins():
                mark = "" if a["active"] else "  (revoked)"
                seen = a["last_login_at"] or "never signed in"
                mfa = "TOTP" if a["totp_enabled"] else "TOTP NEEDED"
                print(f"{a['id']:>3}  {a['role']:<12} {a['email']:<32} "
                      f"{mfa:<11} {seen}{mark}")
        elif cmd == "add" and rest:
            _, first = add_admin(rest[0], _ask_password(),
                                   "SUPER_ADMIN" if "--super" in rest else "ADMIN")
            print(f"created {rest[0]}" + (" as the first, so SUPER_ADMIN" if first else ""))
        elif cmd == "passwd" and rest:
            set_password(rest[0], _ask_password())
            print(f"changed, and every live session for {rest[0]} is gone")
        elif cmd == "totp-enroll" and rest:
            if not sys.stdin.isatty():
                raise SystemExit(
                    "totp-enroll needs an interactive terminal so its setup key "
                    "does not land in deployment logs.\n"
                    "Run: docker compose exec namba python admin.py totp-enroll "
                    f"{rest[0]}"
                )
            setup = totp_enrollment(rest[0])
            print(
                "In Google Authenticator, choose + then Enter a setup key.\n"
                f"Account: Namba ({setup['email']})\n"
                f"Key:     {setup['key']}\n"
                "Type:    Time based\n\n"
                "For another authenticator app, the provisioning URI is:\n"
                f"{setup['uri']}\n\n"
                "Do not paste either value into an online QR-code generator."
            )
            code = input("current six-digit code: ").strip()
            enable_totp(rest[0], setup["generation"], code)
            print("TOTP enrolled. Existing sessions are gone; wait for the next "
                  "code before signing in.")
        elif cmd in ("deactivate", "activate") and rest:
            set_active(rest[0], cmd == "activate")
            print(f"{rest[0]} is now {'active' if cmd == 'activate' else 'revoked'}")
        elif cmd in ("status", "hide", "show", "purge") and rest and rest[0].isdigit():
            pid = int(rest[0])
            if cmd == "status":
                state, title = status_of(pid)
                print(f"{pid} {state} -- {title}")
            elif cmd in ("hide", "show"):
                state = set_status(pid, "HIDDEN" if cmd == "hide" else "ACTIVE")
                print(f"{pid} is now {state}")
            else:
                # --yes for the reason gc_uploads.py wants --delete: this is the
                # one command in the repo a typo cannot be taken back from.
                if "--yes" not in rest:
                    state, title = status_of(pid)
                    raise SystemExit(
                        f"{pid} {state} -- {title}\nthis is permanent: the entry, "
                        f"its history and its picture.\npass --yes to go ahead."
                    )
                gone = purge(pid)
                print(f"purged {pid}" + (f", removed {gone}" if gone else ""))
        else:
            raise SystemExit(__doc__)
    except (LookupError, ValueError) as e:
        raise SystemExit(str(e))
