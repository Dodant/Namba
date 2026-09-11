# ADR-0028: The editor plugin's read is counted, and it is not an event

- Status: accepted
- Date: 2026-09-11

## Context

Nothing about a read is written down here. There are no reader accounts
(ADR-0001), no analytics script and no record of who looked at `/n/42`:
`events` holds writes and operators' decisions, and a visitor who only reads
leaves the wiki exactly as they found it.

The editor plugin made one question worth asking anyway -- is anybody running
it? -- and nothing on the box could answer it.

- `/plugin install` is a git clone from GitHub. Nothing calls home.
- The marketplace reports no install back to the wiki.
- GitHub's own clone count is fourteen days deep and counts a marketplace
  refresh and a CI checkout the same as a person.
- The access log has every plugin call in it, but it is uvicorn's stdout: it
  lives as long as the host's docker logs do, it is a line of text rather than
  a row, and the panel cannot ask it anything.

So the request itself, or nothing.

## Decision

A request that **names itself** as the plugin is counted. `is_plugin` in
`events.py` matches a `User-Agent` beginning `namba-plugin`, and `/api/posts`
-- the one endpoint the plugin reads -- counts it when it matches. Every other
read still records nothing, which is very nearly every read.

That self-declaration is the whole of the boundary, and it is the reason this
is not analytics arriving by the side door: what gets counted is the traffic
that asked to be.

It is a counter in its own table and **not** a row in `events`. Three reasons,
any one of them enough:

| | |
|---|---|
| `events` is append-only, which is what makes it an audit log (ADR-0004) | this is a counter that UPDATEs |
| `/loop 30m` is 48 calls a day per install | as event rows they would bury the operator's recent-changes feed |
| the abuse page reads `events` and nothing else | an install asking politely every half hour would sit at the top of it, looking exactly like somebody hammering the wiki |

`plugin_days` is keyed `(day, ip_hash)` and holds `calls`, `first_at` and
`last_at`. On the address hash alone, because the plugin is curl and carries no
cookie: there is no `client_hash` to group on, so a row is a *client* and never
a person -- an office is one of them and a laptop on two networks is two.

The write is one INSERT with an upsert and appends rather than decides, so
`with con:` is the right amount of ceremony and not `db.writing` (ADR-0007).

**It is not one write per call, and that is the part that took a second
pass.** `/api/posts` carries no limiter -- reads are free here -- so an upsert
per call put SQLite's single write lock behind an unauthenticated, unmetered
GET: a client sending the header at a high rate keeps the lock busy, and the
twelve routes that really do write wait on `db.connect`'s five seconds and
then 500 with "database is locked". The read spam this wiki accepts by design
became write starvation it does not. `events._pending` is the answer: the
first call of a client's day is written straight away, the calls inside the
following minute are added up in memory, and the next call after that carries
them in. Every call is still counted; what is bounded is how often the lock is
taken for them, and the table is bounded with it -- one row per client per day
is now also at most one *write* per client per minute.

That dict is a fourth structure in process memory beside the three limiters,
so the one-process rule (ADR-0008) covers it and the note in `CLAUDE.md` names
it. The cost is stated rather than hidden: whatever is still pending when the
process stops, or when a client stops asking, is never written. Under a minute
of one client's polling is the whole exposure.

Two smaller things in the same block. The wait is capped at 50ms for this one
statement rather than inherited from the connection, because a plugin call
must not sit on a threadpool slot for five seconds while somebody's save
commits -- dropping the count is the cheaper answer. And the failure is
printed. `with con:` commits in `__exit__` and does **not** roll back when the
commit itself is what failed, so the handler rolls back explicitly: without it
a full disk leaves the request holding the write lock through every read below
it.

`GET /api/admin/plugin` answers a window of days, and the panel's *Editor
plugin* page draws it. No number on either is an install count, and both say
so in the place the number is shown -- `ever`, every client that has ever
asked, is the closest honest thing to one, and an install that never runs was
never a user.

## Consequences

- **Half of this lives in the other repository, and the pair is hand-copied.**
  The header is in `Dodant/Namba-plugin`'s `SKILL.md`; the prefix it has to
  start with is `PLUGIN_UA` in `events.py`. Change one and the figures go
  quietly to zero -- no error, no empty-state, just a page of nothing that
  looks like nobody using the plugin. No test here can catch it, because the
  other side is not in this repository, which is why it is written down
  instead, the way the one-process rule is (ADR-0008).
- Forgeable, and that is accepted rather than mitigated. Anybody can send the
  header and anybody can withhold it. It is a usage figure on an open wiki,
  not an audited one, and there is nothing to audit it with that would not be
  an identifier -- which is a reader account by another name.
- The plugin's users are countable and the wiki's readers are not, which is
  the asymmetry somebody will eventually propose fixing. The answer is that
  the plugin is counted *because* it volunteered, and a browser cannot
  volunteer.
- `admin.py purge` does not reach this table and does not need to: a row is a
  hash, a day and three integers. Nothing a stranger typed is in it.
- No retention sweep, for the same reason ADR-0004 declined one.
- **`ever` only ever goes up, and some of the rise is not people arriving.** A
  client is an address, so a laptop on mobile broadband or any DHCP-renewing
  home connection becomes a new client each time its address changes: one
  install is an arbitrary and slowly rising number of clients over months,
  while the window's own `clients` stays honest. Worse, `events.SECRET` salts
  the hash, so a key restored from backup or rotated makes every client new at
  once and the panel shows a wave of first-time installs that never happened.
  The page says a client is not a person; it cannot say which of those two
  things a rise is.
- A clock that steps backwards across midnight -- an NTP correction after a VM
  restore -- lands a call on the earlier day, and since `new` is `MIN(day)` per
  client, a first-time day the operator has already read can move. Small, and
  accepted: the alternative is pinning a first-seen column, which is a second
  answer to a question `MIN(day)` already answers.

## Verified

2026-09-11. `test_the_plugin_is_counted_and_is_never_a_write` asserts that
three calls under the plugin's user agent are one client with three calls and
one `new`; that an ordinary read changes nothing; that `ever` ignores the
window while every other figure obeys it; and that the four places a plugin
read must not appear -- the `events` table, the dashboard's `writes_1h`, the
recent-changes feed, and the abuse page, which is cleared by the first of
those -- are all untouched. Backend suite green.

The hand-copied half was checked the only way it can be, by running the
plugin's own command: the `curl` line out of `SKILL.md`, flags and all, with
the host pointed at a local server, leaves `plugin_days` holding one row for
today with `calls` 1, and the ordinary read straight after it leaves that 1.

The lock is measured rather than argued. With another connection holding
`BEGIN IMMEDIATE`, one plugin `GET /api/posts?limit=1`:

| | |
|---|---|
| before the cap, inheriting the connection's five seconds | 5219.8 ms, 200, count dropped |
| with the 50ms cap | 65.6 ms, 200, count dropped |
| the same GET with no header | 3.0 ms |

Uncontended, the first call of a window is 3.4 ms and a carried one 3.0 ms
against 2.5 ms for a plain read, so the counter costs a tenth of a millisecond
on the ordinary path and nothing at all on the calls it coalesces.

Four of the rules above are pinned by mutation rather than by assertion alone,
each confirmed to turn the suite red: an exact-match user agent instead of the
prefix; `COUNT(*)` instead of `SUM(d.day = b.day)`, and a window-scoped `born`
(both of which make `new` mean "first seen in the window"); dropping the
carried calls; never writing the first call of a window; and lifting the
`try/except` out of `list_posts`.

## History

- 2026-09-11 (`c5d9528`): the plugin ships, in its own repository, and nothing
  counts it.
- 2026-09-11: `plugin_days`, `/api/admin/plugin` and the panel page added
  here. The plugin's `curl` was still sending its `curl/8.x` default, so every figure
  was zero and nothing said why.
- 2026-09-11: `-A namba-plugin` added to the plugin's `SKILL.md` -- the half
  of the pair that lives in the other repository -- and its README says what
  the header is for.
- 2026-09-11: reviewed before merge. The upsert-per-call was the finding three
  independent passes agreed on, measured at 5219.8 ms for one plugin GET
  against a held write lock; `events._pending`, the 50ms cap, the explicit
  rollback and the printed traceback are that review's answer. The panel's
  fourth tile had been labelled "Entries served" over a count of *calls*, and
  the plugin asks for five entries a call; the endpoint's three reads were
  three snapshots and could answer an empty window beside a client count of
  one.
