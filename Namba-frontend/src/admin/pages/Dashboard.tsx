import { useEffect, useState } from 'react'
import { errorText, showValue } from '../../api'
import { adm, type Event, type Stats } from '../api'
import { LogTable } from '../log'
import { Empty } from '../ui'

/* Eleven counters is too many to read, so they are grouped: what the wiki *is*,
   what happened to it today, and what is waiting for somebody. The third group
   is the only one an operator has to act on, so it comes first. */
const GROUPS: { head: string; cells: { key: keyof Stats; label: string; loud?: boolean }[] }[] = [
  {
    head: 'Waiting for you',
    cells: [
      { key: 'requests_pending', label: 'Delete requests', loud: true },
      { key: 'reports_open', label: 'Open reports', loud: true },
      { key: 'blocked', label: 'Blocked clients' },
      { key: 'hidden', label: 'Off the wiki' },
    ],
  },
  {
    head: 'Today',
    cells: [
      { key: 'created_today', label: 'Entries written' },
      { key: 'edited_today', label: 'Entries rewritten' },
      { key: 'edits_24h', label: 'Edits, 24 hours' },
      { key: 'writes_1h', label: 'Writes, last hour' },
    ],
  },
  {
    head: 'The wiki',
    cells: [
      { key: 'numbers', label: 'Numbers' },
      { key: 'entries', label: 'Entries' },
      { key: 'comments', label: 'Comments' },
    ],
  },
]

/** The landing page.

    `stats` comes down as a prop rather than being fetched here: the rail shows
    the same waiting-counts, and two requests for one set of numbers would let
    them disagree on screen. */
export default function Dashboard(
  { stats, onChange }: { stats: Stats | null; onChange: () => void },
) {
  const [feed, setFeed] = useState<Event[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    /* Refreshed on arrival, not on a timer. A dashboard that moves under an
       operator's cursor while they are reading a row is worse than one they
       reload -- and there is exactly one operator, who knows when they did
       something. */
    onChange()
    adm.activity({ limit: 25 }).then(
      (p) => setFeed(p.rows),
      (e) => setErr(errorText(e)),
    )
  }, [onChange])

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="lede">
        Where the wiki is, and what it has been doing. Everything here is a link
        to the page you would act on.
      </p>

      {GROUPS.map((g) => (
        <section className="stat-group" key={g.head}>
          <h2>{g.head}</h2>
          <div className="stats">
            {g.cells.map((c) => (
              <div className={`stat ${c.loud && stats?.[c.key] ? 'loud' : ''}`} key={c.key}>
                {/* the dash is not a zero: before the answer lands, "0 open
                    reports" is a result where a wait belongs */}
                <b className="num">{stats ? showValue(String(stats[c.key]), true) : '—'}</b>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="stat-group">
        <h2>Lately</h2>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        {!feed ? (
          !err && <Empty>Loading…</Empty>
        ) : (
          <LogTable rows={feed} />
        )}
      </section>
    </div>
  )
}
