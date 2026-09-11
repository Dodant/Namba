import { useEffect, useState } from 'react'
import { errorText } from '../../api'
import { adm, type PluginUse } from '../api'
import { Empty, Fail, Head, Loading, Table } from '../ui'

/* Windows an operator actually asks about: this week, this month, the quarter,
   the year. Days and not minutes -- nobody watches a plugin by the hour, and
   the table is one row per day. */
const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last year' },
]

/** Who is still running the editor plugin, by day.

    The page says out loud what it cannot answer. An install is a git clone
    from GitHub; nothing calls home and the marketplace reports nothing back,
    so there is no install count to show and none of these numbers is one.
    What there is instead is what ran: every client that has ever asked, the
    ones that asked inside the window, and the ones asking for the first time.

    A client is an address hash, because the plugin is curl and sends no
    cookie -- one office is one client and one laptop on two networks is two.
    That is a floor and a ceiling at once, so the figures are labelled
    "clients" everywhere and never "people". */
export default function Plugin() {
  const [days, setDays] = useState(30)
  const [got, setGot] = useState<PluginUse | null>(null)
  const [err, setErr] = useState('')

  function load() {
    setGot(null)
    setErr('')
    adm.plugin({ days }).then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(load, [days])

  /* Summed here rather than in two more queries: the rows are already on this
     page, and `new` is summable because a client has exactly one first day. */
  const arrived = got?.rows.reduce((n, d) => n + d.new, 0) ?? 0
  const calls = got?.rows.reduce((n, d) => n + d.calls, 0) ?? 0
  /* The bar's scale. `|| 1` so a window with no rows divides by something. */
  const peak = Math.max(1, ...(got?.rows.map((d) => d.clients) ?? []))

  const COLS = ['Day', 'Clients', 'New', 'Calls', '']

  return (
    <div className="page">
      <Head
        title="Editor plugin"
        tally={got && `${got.ever} ever`}
        hint="Installs cannot be counted — a plugin install is a git clone and
              nothing calls home — so this counts what ran. A client is an
              address, not a person: one office is one of them, and the plugin
              identifies itself in a header anybody could send."
      />

      <div className="bar">
        <div className="field">
          <label htmlFor="pl-win">Window</label>
          <select id="pl-win" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.days} value={w.days}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <span className="hash push self">{got && <>since {got.since}</>}</span>
      </div>

      <Fail msg={err} onRetry={load} />

      <div className="pulse">
        {/* Ever first: it is the closest thing to "how many installed", and
            reading it beside the window's own count is what says whether the
            plugin is still in use or was only ever tried. */}
        <span className="fig">
          <b className="num">{got ? got.ever : '—'}</b>
          <span>Clients ever</span>
        </span>
        <span className="fig">
          <b className="num">{got ? got.clients : '—'}</b>
          <span>Using it, this window</span>
        </span>
        <span className="fig">
          <b className="num">{got ? arrived : '—'}</b>
          <span>First time, this window</span>
        </span>
        <span className="fig">
          <b className="num">{got ? calls : '—'}</b>
          <span>Entries served</span>
        </span>
      </div>

      {!got ? (
        !err && <Loading cols={COLS} rows={6} />
      ) : got.rows.length ? (
        <Table cols={COLS}>
          {got.rows.map((d) => (
            <tr key={d.day}>
              {/* Days nobody asked on are missing rather than zero, which is
                  why every row says its own date: a gap here is a gap, not a
                  flat line drawn through one. */}
              <td className="tight num">{d.day}</td>
              <td className="tight right num">
                <b>{d.clients}</b>
              </td>
              <td className="tight right num">{d.new || ''}</td>
              <td className="tight right num">{d.calls}</td>
              <td className="trend">
                <span style={{ width: `${(d.clients / peak) * 100}%` }} />
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>
          Nothing has asked in that window. The plugin only calls when somebody
          runs it, so a quiet week is a quiet week and not a broken counter.
        </Empty>
      )}
    </div>
  )
}
