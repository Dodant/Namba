import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BLOCK_HOURS, BLOCK_HOURS_LABEL, errorText } from '../../api'
import { adm, type Abuse as Signal, type AbuseRow } from '../api'
import { useAction } from '../state'
import { Confirm, Empty, Fail, Hash, Head, Loading, NoteField, Table, When } from '../ui'

/* Windows an operator actually asks about: what is happening now, what happened
   while I was asleep, what happened this week. */
const WINDOWS = [
  { minutes: 10, label: 'Last 10 minutes' },
  { minutes: 60, label: 'Last hour' },
  { minutes: 60 * 24, label: 'Last day' },
  { minutes: 60 * 24 * 7, label: 'Last week' },
]

/** Who has been writing a lot lately.

    This page counts and says so. The patterns counting cannot see -- the same
    entry rewritten in a loop, one advert under twenty numbers, a campaign
    spread thin over a day -- are what the duplicates table below starts on and
    what a scoring pass would finish; the shape is here for it, one row per
    client per window with every write already in the log.

    Grouped by address rather than by cookie, because a cookie is cleared in a
    click. The cookie hash comes along so a block can be aimed at whichever is
    the tighter fit: the address catches a cleared browser, the cookie catches
    the same person on a new address. */
export default function Abuse() {
  const [minutes, setMinutes] = useState(60)
  const [least, setLeast] = useState(5)
  const [got, setGot] = useState<Signal | null>(null)
  const [err, setErr] = useState('')
  const [busy, run] = useAction(setErr)
  const [ask, setAsk] = useState<{ row: AbuseRow; kind: 'ip' | 'client' } | null>(null)
  const [hours, setHours] = useState<number | null>(24)
  const [why, setWhy] = useState('')

  function load() {
    setGot(null)
    setErr('')
    adm.abuse({ minutes, least }).then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(load, [minutes, least])

  function block() {
    if (!ask) return
    const target = ask.kind === 'ip' ? ask.row.ip_hash : ask.row.a_client
    if (!target) return
    run(async () => {
      await adm.addBlock({ type: ask.kind, target_hash: target, reason: why, hours })
      setAsk(null)
      setWhy('')
      load()
    })
  }

  const COLS = ['Address', 'Writes', 'New', 'Edits', 'Talk', 'Flags', 'Files',
                'Entries', 'Browsers', 'First', 'Last', '']

  return (
    <div className="page">
      <Head
        title="Spam & abuse"
        tally={got && `${got.clients.length} clients`}
        hint="Counting, not detection — and the counts are of writes, so
              reading the wiki never appears here. A row is one address over
              the window; browsers is how many cookies have been seen behind it."
      />

      <div className="bar">
        <div className="field">
          <label htmlFor="ab-win">Window</label>
          <select
            id="ab-win"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {WINDOWS.map((w) => (
              <option key={w.minutes} value={w.minutes}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ab-least">At least</label>
          <select id="ab-least" value={least} onChange={(e) => setLeast(Number(e.target.value))}>
            {[1, 3, 5, 10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} write{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </div>
        <span className="hash push self">
          {got && <>since <When at={got.since} /></>}
        </span>
      </div>

      <Fail msg={err} onRetry={load} />

      <section className="stat-group">
        <h2>Clients</h2>
        {!got ? (
          !err && <Loading cols={COLS} rows={5} />
        ) : got.clients.length ? (
          <Table cols={COLS}>
            {got.clients.map((c) => (
              <tr key={c.ip_hash} className={c.blocked ? 'dim' : ''}>
                <td className="tight">
                  {/* The column that made this page decidable. Twelve counts
                      say somebody wrote a lot and never what they wrote, and
                      blocking an address on a number alone is a guess -- so
                      the hash leads to their rows in the log. */}
                  <Hash value={c.ip_hash} to={`/changes?ip=${c.ip_hash}&kind=all`} />
                </td>
                <td className="tight right num">
                  <b>{c.writes}</b>
                </td>
                <td className="tight right num">{c.creates || ''}</td>
                <td className="tight right num">{c.edits || ''}</td>
                <td className="tight right num">{c.comments || ''}</td>
                {/* requests and reports together: both are "this person is
                    telling us about entries", and apart they are two thin
                    columns that are almost always zero */}
                <td className="tight right num">{c.requests + c.reports || ''}</td>
                <td className="tight right num">{c.uploads || ''}</td>
                <td className="tight right num">{c.targets || ''}</td>
                <td className="tight right num">{c.browsers || ''}</td>
                <td className="tight">
                  <When at={c.first_at} />
                </td>
                <td className="tight">
                  <When at={c.last_at} />
                </td>
                <td className="acts">
                  {c.blocked ? (
                    <span className="hash">blocked</span>
                  ) : (
                    <>
                      <button
                        className="btn small danger"
                        onClick={() => setAsk({ row: c, kind: 'ip' })}
                      >
                        Block address
                      </button>
                      {c.a_client && (
                        <button
                          className="btn small"
                          onClick={() => setAsk({ row: c, kind: 'client' })}
                        >
                          Just the browser
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            Nobody has written {least} time{least === 1 ? '' : 's'} in that window.
          </Empty>
        )}
      </section>

      <section className="stat-group">
        <h2>The same paragraph under several numbers</h2>
        <p className="lede">
          A shared <em>title</em> is not evidence and is not listed: five people
          writing about five numbers called “Time” is the wiki working. Title-only
          spam shows up in the counts above instead.
        </p>
        {!got ? null : got.duplicates.length ? (
          <Table cols={['What they all say', 'Entries', 'Titles', 'Which']}>
            {got.duplicates.map((d) => (
              <tr key={d.said}>
                <td className="wide">
                  <span title={d.said}>{d.said}</span>
                </td>
                <td className="tight right num">
                  <b>{d.entries}</b>
                </td>
                <td className="tight right num">{d.titles}</td>
                <td className="tight">
                  {d.ids.split(',').map((id) => (
                    <Link className="idlink" to={`/content/${id}`} key={id}>
                      {id}
                    </Link>
                  ))}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No paragraph appears under three or more numbers.</Empty>
        )}
      </section>

      <Confirm
        open={!!ask}
        title={ask?.kind === 'client' ? 'Block this browser?' : 'Block this address?'}
        verb="Block it"
        danger
        busy={busy}
        onCancel={() => {
          setAsk(null)
          setWhy('')
        }}
        onOk={block}
      >
        {ask && (
          <>
            <p>
              They will not be able to write — no entries, no edits, no comments,
              no reports. Reading is untouched, because barring somebody from
              reading an open wiki achieves nothing.
            </p>
            <p className="quoted">
              {ask.kind === 'ip' ? (
                <>
                  Address <b>{ask.row.ip_hash.slice(0, 8)}…</b> — catches this
                  browser even with its cookies cleared, and catches anybody else
                  behind the same address, which on an office or a phone network
                  is a lot of people.
                </>
              ) : (
                <>
                  Browser <b>{(ask.row.a_client ?? '').slice(0, 8)}…</b> — follows
                  them to another address and catches nobody else, but they can
                  clear it in a click.
                </>
              )}
            </p>
            <div className="field">
              <label htmlFor="bk-len">For how long</label>
              <select
                id="bk-len"
                value={String(hours)}
                onChange={(e) => setHours(e.target.value === 'null' ? null : Number(e.target.value))}
              >
                {BLOCK_HOURS.map((h) => (
                  <option key={String(h)} value={String(h)}>
                    {BLOCK_HOURS_LABEL[String(h)]}
                  </option>
                ))}
              </select>
            </div>
            <NoteField
              label="Why (kept on the block and in the log)"
              value={why}
              onChange={setWhy}
              placeholder="Shown to them when a write is refused"
            />
          </>
        )}
      </Confirm>
    </div>
  )
}
