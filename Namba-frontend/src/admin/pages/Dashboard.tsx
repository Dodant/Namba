import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText } from '../../api'
import { fmtDate, showValue } from '../../format'
import { adm, type Event, type Stats } from '../api'
import { LogTable } from '../log'
import { Fail, Head, Loading } from '../ui'

/* What is waiting, and how long it has been waiting.

   Every one of these is a link with the filter already applied, because a
   number on a dashboard that an operator then has to go and find again is a
   number that cost them a trip. `age` names the field holding the arrival of
   the oldest one still open: three requests is nothing and three requests from
   March is a wiki nobody is minding, and the count alone cannot tell them
   apart. `loud` is for the two that are somebody else waiting on an answer --
   an entry off the wiki and a blocked client are settled states. */
const QUEUE: {
  key: keyof Stats; label: string; to: string; age?: keyof Stats; loud?: boolean
}[] = [
  { key: 'requests_pending', label: 'Delete requests', to: '/requests?status=PENDING',
    age: 'oldest_request', loud: true },
  { key: 'reports_open', label: 'Open reports', to: '/reports?status=OPEN',
    age: 'oldest_report', loud: true },
  { key: 'errors_24h', label: 'Server errors, 24h', to: '/audit?kind=all&action=ERROR&hours=24' },
  { key: 'hidden', label: 'Off the wiki', to: '/content?status=HIDDEN' },
  { key: 'blocked', label: 'Blocked clients', to: '/blocks' },
]

/* Context rather than a queue: nothing here is waiting for a decision, so it
   is a strip of figures instead of five more cards competing with the ones
   that are. Still links -- "writes in the last hour" is a number an operator
   reads and then immediately wants to see behind. */
const PULSE: { key: keyof Stats; label: string; to?: string }[] = [
  { key: 'writes_1h', label: 'Writes, last hour', to: '/changes?hours=1' },
  { key: 'edits_24h', label: 'Edits, 24 hours', to: '/changes?action=EDIT&hours=24' },
  { key: 'created_today', label: 'Written today', to: '/content?sort=created' },
  { key: 'edited_today', label: 'Rewritten today', to: '/content?sort=updated' },
  { key: 'entries', label: 'Entries', to: '/content' },
  { key: 'numbers', label: 'Numbers', to: '/content?sort=number' },
  { key: 'comments', label: 'Comments' },
]

const FEED = ['Everything', 'Visitors', 'Operators']
const FEED_KIND = { Everything: 'all', Visitors: 'anon', Operators: 'admin' } as const

/** The landing page, and the one question it answers: what needs you.

    `stats` comes down as a prop rather than being fetched here -- the rail
    shows the same waiting-counts, and two requests for one set of numbers
    would let them disagree on screen. */
export default function Dashboard(
  { stats, onChange }: { stats: Stats | null; onChange: () => void },
) {
  const [feed, setFeed] = useState<Event[] | null>(null)
  const [which, setWhich] = useState<(typeof FEED)[number]>('Everything')
  const [err, setErr] = useState('')

  function load() {
    setFeed(null)
    setErr('')
    adm.activity({ kind: FEED_KIND[which as keyof typeof FEED_KIND], limit: 20 }).then(
      (p) => setFeed(p.rows),
      (e) => setErr(errorText(e)),
    )
  }

  useEffect(() => {
    /* Refreshed on arrival, not on a timer. A dashboard that moves under an
       operator's cursor while they are reading a row is worse than one they
       reload -- and there is exactly one operator, who knows when they did
       something. */
    onChange()
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, which])

  /* Two units, said as two. Adding them makes one number that means nothing:
     a report is one person objecting and the queue groups them per entry, so
     37 reports is fourteen things to look at, while 9 requests is nine. */
  const waiting = stats && (stats.requests_pending || stats.reports_open
    ? [stats.requests_pending && `${stats.requests_pending} requests`,
       stats.reports_open && `${stats.reports_open} reports`]
      .filter(Boolean).join(' · ')
    : '')

  return (
    <div className="page">
      <Head
        title="Dashboard"
        tally={
          waiting == null ? '' : waiting
            ? <span className="badge warn">{waiting} waiting on you</span>
            : <span className="badge ok">nothing waiting</span>
        }
      />

      <div className="stats">
        {QUEUE.map((c) => {
          const n = stats?.[c.key] as number | undefined
          const since = c.age ? (stats?.[c.age] as string | null) : null
          return (
            <Link
              className={`stat ${c.loud && n ? 'loud' : ''} ${n ? '' : 'quiet'}`}
              to={c.to}
              key={c.key}
            >
              {/* the dash is not a zero: before the answer lands, "0 open
                  reports" is a result where a wait belongs */}
              <b className="num">{stats ? showValue(String(n), true) : '—'}</b>
              <span>{c.label}</span>
              {/* only the age of the oldest, and only when there is one. It is
                  the half of the answer a count cannot give. */}
              <span className="stat-age">
                {since ? `oldest ${fmtDate(since)}` : n ? ' ' : 'clear'}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="pulse">
        {PULSE.map((c) => {
          const shown = (
            <>
              <b className="num">{stats ? showValue(String(stats[c.key]), true) : '—'}</b>
              <span>{c.label}</span>
            </>
          )
          return c.to ? (
            <Link className="fig" to={c.to} key={c.key}>{shown}</Link>
          ) : (
            <span className="fig" key={c.key}>{shown}</span>
          )
        })}
      </div>

      <div className="head sub">
        <h2>Lately</h2>
        <div className="head-acts">
          {FEED.map((f) => (
            <button
              key={f}
              className={`btn small ${which === f ? 'on' : ''}`}
              aria-pressed={which === f}
              onClick={() => setWhich(f)}
            >
              {f}
            </button>
          ))}
          <Link className="btn small" to={which === 'Operators' ? '/audit' : '/changes'}>
            All of it →
          </Link>
        </div>
      </div>
      <Fail msg={err} onRetry={load} />
      {!feed
        ? !err && <Loading cols={['When', 'Who', 'Did', 'To', 'From']} rows={6} />
        : <LogTable rows={feed} />}
    </div>
  )
}
