import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, REASON_LABEL, REPORT_STATUSES } from '../../api'
import { showValue } from '../../format'
import { adm, type Page, type ReportGroup } from '../api'
import { EntrySheet } from '../sheet'
import { useAction, useQueue, useUrlFilters } from '../state'
import { Confirm, Empty, Fail, Head, Loading, NoteField, Pager, Row, Table, When } from '../ui'

const PER = 50

const COLS = ['Entry', 'Reports', 'Reasons given', 'First', 'Last', '']

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

    Opening a row opens the *entry* beside the reports, which is the whole
    change: the reasons alone never answered whether the entry deserved them,
    so every decision here used to start with a trip to another page and end
    with finding your place in the queue again. Now the queue is worked in
    place — read, decide, and the row drops out from under you leaving the next
    one open. */
export default function Reports({ onChange }: { onChange: () => void }) {
  const { get, set, offset } = useUrlFilters()
  const [got, setGot] = useState<Page<ReportGroup> | null>(null)
  const [err, setErr] = useState('')
  const [busy, run] = useAction(setErr)
  const [ask, setAsk] = useState<{ row: ReportGroup; how: keyof typeof DECIDE } | null>(null)
  const [note, setNote] = useState('')

  const status = get('status', 'OPEN')
  const queue = useQueue(got?.rows)

  function load(quiet = false) {
    /* Quiet after a decision: blanking the list would take the open row out
       from under the drawer, close it, and put it back a tick later. Left
       standing, the decided row simply drops out and the index it vacated is
       the next item -- which is the queue advancing by itself. */
    if (!quiet) setGot(null)
    setErr('')
    adm.reports({ status, limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(() => {
    load()
    queue.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, offset])

  function decide() {
    if (!ask) return
    run(async () => {
      await adm.decideReports(ask.row.post_id, ask.how, note)
      setAsk(null)
      setNote('')
      load(true)
      onChange()
    })
  }

  return (
    <div className="page">
      <Head
        title="Reports"
        tally={got && `${got.total} ${status === 'ALL' ? 'in all' : status.toLowerCase()}`}
      />

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
        <span className="hash push self">
          Click a row to read the entry beside the reports · ↑↓ to move
        </span>
      </div>

      <Fail msg={err} onRetry={() => load()} />

      {!got ? (
        !err && <Loading cols={COLS} />
      ) : got.rows.length ? (
        <>
          <Table cols={COLS}>
            {got.rows.map((r, i) => (
              <Row
                key={r.post_id}
                className={queue.at === i ? 'lit' : ''}
                onOpen={() => queue.open(i)}
              >
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
                  {status === 'OPEN' && (
                    <button
                      className="btn small primary"
                      onClick={() => setAsk({ row: r, how: 'RESOLVE' })}
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </Row>
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

      <EntrySheet
        postId={queue.row?.post_id ?? null}
        at={queue.label}
        onStep={queue.step}
        onClose={queue.close}
        onChanged={() => {
          load(true)
          onChange()
        }}
      >
        {status === 'OPEN' && queue.row && (
          <>
            <button
              className="btn"
              onClick={() => setAsk({ row: queue.row!, how: 'IGNORE' })}
            >
              Dismiss
            </button>
            <button
              className="btn primary"
              onClick={() => setAsk({ row: queue.row!, how: 'RESOLVE' })}
            >
              Resolve
            </button>
          </>
        )}
      </EntrySheet>

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
