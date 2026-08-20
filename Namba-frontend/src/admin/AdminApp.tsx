import { useCallback, useEffect, useState } from 'react'
import {
  BrowserRouter, Link, Navigate, Route, Routes, useLocation,
} from 'react-router-dom'
import { adm, type Stats, type Who } from './api'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Content from './pages/Content'
import Entry from './pages/Entry'

/** Every page in the panel, in the order the rail lists them.

    One list, and the rail is drawn from it, so a page cannot exist without
    appearing here or appear here without existing. `tally` names the field of
    `stats` whose count belongs beside it: the dashboard says these numbers too,
    but this is where an operator goes to act on them, and a queue you have to
    open to discover is empty is a queue you stop opening. */
type Item = { to: string; label: string; group: string; tally?: keyof Stats }

const NAV: Item[] = [
  { to: '/', label: 'Dashboard', group: '' },
  { to: '/content', label: 'All content', group: 'Content' },
]

/** The rail.

    Sticky and full height on a desktop, lying across the top and scrolling
    sideways below 900. Not a drawer: a table needs the width more than the
    navigation does, but an operator moving between a report and the entry it is
    about should not pay a tap for it either way. */
function Rail({ who, stats, onOut }: { who: Who; stats: Stats | null; onOut: () => void }) {
  const { pathname } = useLocation()
  let group = ''

  return (
    <nav className="rail">
      <div className="rail-top">
        <Link to="/" className="rail-logo">
          Na<span>mb</span>a
        </Link>
        <span className="rail-sub">Back office</span>
      </div>
      <div className="nav">
        {NAV.map((item) => {
          const head = item.group && item.group !== group ? item.group : ''
          group = item.group
          const on = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
          const n = item.tally && stats ? stats[item.tally] : 0
          return (
            <div key={item.to}>
              {head && <div className="nav-group">{head}</div>}
              <Link to={item.to} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
                {item.label}
                {!!n && <span className="tally">{n}</span>}
              </Link>
            </div>
          )
        })}
      </div>
      <div className="rail-foot">
        <b>{who.email}</b>
        <span className="role">{who.role}</span>{' · '}
        {/* a link rather than a button: it is the one control down here and a
            filled capsule for "leave" in the corner of every page is louder
            than leaving deserves */}
        <a href="#out" onClick={(e) => { e.preventDefault(); onOut() }}>
          sign out
        </a>
      </div>
    </nav>
  )
}

/** The gate, and the only place the answer to "who am I" is asked for.

    Three states and they are genuinely three: still asking, nobody, somebody.
    Drawing the login screen while the answer is in flight would flash it at
    every operator on every reload, which is the one thing a login screen must
    not do. */
export default function AdminApp() {
  const [who, setWho] = useState<Who | null>(null)
  const [asked, setAsked] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    adm.me().then(setWho, () => setWho(null)).finally(() => setAsked(true))
  }, [])

  /* The rail's waiting-counts and the dashboard's are one fetch. Handed down
     rather than fetched twice: they are the same numbers and two requests would
     let them disagree on screen. */
  const refresh = useCallback(() => {
    adm.stats().then(setStats, () => setStats(null))
  }, [])

  useEffect(() => {
    if (who) refresh()
  }, [who, refresh])

  async function out() {
    try {
      await adm.logout()
    } finally {
      /* Signed out either way. A logout that failed on the wire has still
         ended this browser's session as far as the operator is concerned, and
         leaving them apparently signed in is the worse of the two lies. */
      setWho(null)
      setStats(null)
    }
  }

  if (!asked) return <div className="gate" />
  if (!who) return <Login onIn={setWho} />

  return (
    <BrowserRouter basename="/admin">
      <div className="shell">
        <Rail who={who} stats={stats} onOut={out} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard stats={stats} onChange={refresh} />} />
            <Route path="/content" element={<Content />} />
            {/* An entry, not a drawer: the diff wants the width, and the page
                is linkable -- an operator working a queue needs to be able to
                send one of these to somebody. */}
            <Route path="/content/:id" element={<Entry />} />
            {/* Anything else is a stale bookmark from a version of the panel
                that had more pages, or a typed path. Home, rather than a
                dead end: there is nowhere else to be in here. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
