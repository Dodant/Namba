import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, REASON_LABEL, REPORT_STATUSES } from '../../api'
import { showValue } from '../../format'
import { adm, type Page, type Report, type ReportGroup } from '../api'
import { useAction, useUrlFilters } from '../state'
import {
  Badge, Confirm, Drawer, Empty, Hash, NoteField, Pager, Table, When,
} from '../ui'

const PER = 50

const DECIDE = {
  RESOLVE: {
    ask: 'Mark these reports dealt with?',
    verb: 'Resolve them',
    says: 'Closes every open report on this entry. It does nothing to the entry '
      + 'itself — hiding it, reverting it or blocking whoever wrote it are '
      + 'separate buttons, so that each one lands in the log as itself.',
  },
  IGNORE: {
    ask: 'Dismiss these reports?',
    verb: 'Dismiss them',
    says: 'Closes them with nothing done, which is the right answer when the '
      + 'entry is fine and the reporters were wrong. The entry can be reported '
      + 'again afterwards, including by the same people.',
  },
} as const

/** Grouped per entry, because five people objecting to one entry is one thing
    for an operator to look at rather than five.
 
    The individual reports open in a drawer rather than on a page: reading them
    is a paragraph, and a page would cost the operator their place in the queue. */
export default function Reports({ onChange }: { onChange: () => void }) {
  const { get, set, offset } = useUrlFilters()
  const [got, setGot] = useState<Page<ReportGroup> | null>(null)
  const [err, setErr] = useState('')
  const [busy, run] = useAction(setErr)
  const [open, setOpen] = useState<ReportGroup | null>(null)
  const [detail, setDetail] = useState<Report[] | null>(null)
  const [ask, setAsk] = useState<{ row: ReportGroup; how: keyof typeof DECIDE } | null>(null)
  const [note, setNote] = useState('')

  const status = get('status', 'OPEN')

  function load() {
    setGot(null)
    setErr('')
    adm.reports({ status, limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(load, [status, offset])

  useEffect(() => {
    if (!open) return setDetail(null)
    setDetail(null)
    adm.reportDetail(open.post_id).then(setDetail, (e) => setErr(errorText(e)))
  }, [open])

  function decide() {
    if (!ask) return
    run(async () => {
      await adm.decideReports(ask.row.post_id, ask.how, note)
      setAsk(null)
      setOpen(null)
      setNote('')
      load()
      onChange()
    })
  }

  return (
    <div className="page">
      <h1>Reports</h1>
      <p className="lede">
        One row per entry, with how many people said something and what they said.
        Deciding here closes the reports and leaves the entry alone.
      </p>

      <div className="bar">
        <div className="field">
          <label htmlFor="rp-status">Show</label>
          <select
            id="rp-status"
            value={status}
            onChange={(e) => set({ status: e.target.value })}
          >
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="ALL">All</option>
          </select>
        </div>
      </div>

      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}

      {!got ? (
        !err && <Empty>Loading…</Empty>
      ) : got.rows.length ? (
        <>
          <Table cols={['Entry', 'Reports', 'Reasons given', 'First', 'Last', '']}>
            {got.rows.map((r) => (
              <tr key={r.post_id}>
                <td className="wide">
                  {r.title ? (
                    <Link to={`/content/${r.post_id}`}>
                      <span className="num">{showValue(r.value ?? '', false)}</span>{' '}
                      {r.title}
                    </Link>
                  ) : (
                    <span className="hash">entry {r.post_id}, gone</span>
                  )}
                  {r.post_status && r.post_status !== 'ACTIVE' && (
                    <span className="hash">already {r.post_status.toLowerCase()}</span>
                  )}
                </td>
                <td className="tight right num">
                  {/* the count is the reason this page is grouped, so it gets
                      the weight -- and it counts people, which is what the
                      one-per-client rule on the way in is for */}
                  <b>{r.reports}</b>
                </td>
                <td>
                  {/* GROUP_CONCAT of the distinct reasons. Split here rather
                      than asked for as an array: SQLite has no array, and one
                      string of eight short words is not worth a second query. */}
                  {r.reasons.split(',').map((why) => (
                    <span className="badge" key={why} title={REASON_LABEL[why] ?? why}>
                      {why}
                    </span>
                  ))}
                </td>
                <td className="tight">
                  <When at={r.first_at} />
                </td>
                <td className="tight">
                  <When at={r.last_at} />
                </td>
                <td className="acts">
                  <button className="btn small" onClick={() => setOpen(r)}>
                    Read them
                  </button>
                  {status === 'OPEN' && (
                    <button
                      className="btn small primary"
                      onClick={() => setAsk({ row: r, how: 'RESOLVE' })}
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pager
            total={got.total}
            limit={PER}
            offset={offset}
            onGo={(next) => set({ offset: String(next) })}
          />
        </>
      ) : (
        <Empty>
          {status === 'OPEN' ? 'Nothing open. Nobody has reported anything.' : 'Nothing here.'}
        </Empty>
      )}

      <Drawer
        open={!!open}
        title={
          open ? (
            <>
              <span className="num">{showValue(open.value ?? '', false)}</span>{' '}
              {open.title ?? `entry ${open.post_id}`}
            </>
          ) : ''
        }
        onClose={() => setOpen(null)}
      >
        {!detail ? (
          <Empty>Loading…</Empty>
        ) : (
          <>
            {detail.map((d) => (
              <div className="note" key={d.id}>
                <b>{d.reason}</b> <Badge>{d.status}</Badge>
                <div className="hash">{REASON_LABEL[d.reason] ?? ''}</div>
                {d.detail ? <p>{d.detail}</p> : <p className="hash">No detail given.</p>}
                <span className="hash">
                  <Hash value={d.ip_hash} /> · cookie <Hash value={d.client_hash} /> ·{' '}
                  <When at={d.created_at} />
                </span>
                {d.decision_note && <p className="hash">Closed: {d.decision_note}</p>}
              </div>
            ))}
            {/* Both hashes on every report, and this is what they are for: the
                same one across four entries is a campaign rather than four
                readers agreeing, and blocking it is a page away. */}
            {open && (
              <div className="sheet-acts">
                <Link className="btn" to={`/content/${open.post_id}`}>
                  Open the entry
                </Link>
                {status === 'OPEN' && (
                  <>
                    <button
                      className="btn"
                      onClick={() => setAsk({ row: open, how: 'IGNORE' })}
                    >
                      Dismiss
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => setAsk({ row: open, how: 'RESOLVE' })}
                    >
                      Resolve
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </Drawer>

      <Confirm
        open={!!ask}
        title={ask ? DECIDE[ask.how].ask : ''}
        verb={ask ? DECIDE[ask.how].verb : ''}
        busy={busy}
        onCancel={() => {
          setAsk(null)
          setNote('')
        }}
        onOk={decide}
      >
        {ask && (
          <>
            <p className="quoted">
              {ask.row.reports} report{ask.row.reports === 1 ? '' : 's'} on{' '}
              <b>{ask.row.title ?? `entry ${ask.row.post_id}`}</b>
            </p>
            <p>{DECIDE[ask.how].says}</p>
            <NoteField
              label="Why (kept in the log, and on each report)"
              value={note}
              onChange={setNote}
              placeholder="What you did about it, if anything"
            />
          </>
        )}
      </Confirm>
    </div>
  )
}
