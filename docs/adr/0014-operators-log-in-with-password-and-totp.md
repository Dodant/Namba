# ADR-0014: Operators log in with a password and a TOTP code, enrolled from the shell

- Status: accepted
- Date: 2026-09-07

## Context

The back office is the one login on the wiki and the one place a compromised
credential can hide an entry or block a client. A password alone is one
factor, and a browser recovery flow is a second door around a second one.

## Decision

Password success creates a five-minute opaque challenge, not a session. The
session cookie is issued when one unused RFC 6238 counter succeeds against
that challenge. Enrollment and recovery are `admin.py totp-enroll`, on an
interactive terminal, never a route: the shell is the existing root of trust.
Re-running the command replaces a lost device's key and revokes every live
session. The key is derived by HMAC from the installation secret, the
operator id and an enrollment generation; the database holds only the
generation and the last accepted counter.

Passwords are stdlib scrypt with the cost stored in the hash. Sessions are
opaque tokens whose sha256 is stored, so logout and revocation bite on the
next request and a leaked database is a list of dead tokens.

## Consequences

- A password without an enrolled authenticator never creates a session; the
  panel says so.
- Rotating `NAMBA_SECRET` or `NAMBA_TOTP_SECRET` after enrollment means
  enrolling every operator again.

## History

- 2026-08-20: password login, sessions, `SameSite=Strict`.
- 2026-09-07 (`e6b737f`, `c9881a2`): the second factor.
