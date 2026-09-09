# ADR-0001: No reader accounts; operators are the one exception

- Status: accepted
- Date: 2026-08-18; revised 2026-08-20

## Context

An open wiki of what numbers mean. Anyone reads, posts and edits with no login
and no identity beyond a nickname they type. Every guard on the public API
assumes it: rate limits count per address, bylines are strings, nothing is
owned.

Moderation needs somebody whose decisions carry a name and can be undone.
Nobody cannot be held to a decision, and an anonymous hide cannot be reviewed.

## Decision

No reader accounts, ever: no signup, no ownership, no per-post permissions, no
"my posts". If a feature needs a reader to log in, the feature is wrong for
this wiki.

Exactly one account table, `admins`, for operators. It buys the back office —
a dashboard, moderation, delete requests, reports, blocks, an audit log, and
the one edit the open half refuses, correcting the number an entry is filed
under. There is no signup route. The first operator comes from a shell
(`admin.py add`) and every one after from a super admin inside the panel.

## Consequences

- The open half's security model is input validation and per-address limits,
  and stays so.
- An operator's decision is a row in `events` with an `admin_id`; a visitor's
  write is a row without one. The two halves of the wiki are one log with two
  filters.
- Nothing in the public API may ask who is asking beyond the three salted
  hashes `events.client_of()` returns.

## History

- 2026-08-18: "No accounts, ever." The wiki shipped with no account table.
- 2026-08-20: Revised to admit operators, deliberately and in writing rather
  than quietly, when the back office was designed
  (`docs/superpowers/specs/2026-08-20-back-office-design.md`). The reader half
  of the rule is unchanged.
