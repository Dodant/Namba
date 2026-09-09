# ADR-0008: One process

- Status: accepted
- Date: 2026-09-09

## Context

Three limiters stand between an open wiki and a script: `main._writes`,
`auth._attempts` and `auth._mfa_attempts`. All three are `defaultdict`s in
process memory.

## Decision

The wiki runs as one process. `--workers 1` in the Dockerfile is the
enforcement, and this record is where the rule lives, because a deploy setting
is not where a rule survives. Adding workers, gunicorn or a second replica
means moving the three limiters out of process memory first, in the same
change.

## Consequences

- A second worker is a second allowance for the same address, and the login
  limiter in particular is what makes five attempts a minute mean five.
- No test can catch a change of worker count.

## History

- 2026-09-09 (`3b15601`): written down as a rule rather than left as a comment
  on the `CMD` line.
