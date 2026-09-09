import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, REASON_LABEL, REQUEST_STATUSES } from '../../api'
import { showValue } from '../../format'
import { adm, type Page, type QueuedRequest } from '../api'
import { useAction, useUrlFilters } from '../state'
import { Badge, Confirm, Empty, Hash, NoteField, Pager, Table, When } from '../ui'

const PER = 50

/* Approving takes an entry off the wiki; rejecting does nothing to it. So they
   ask differently: one says what will happen and what survives it, the other
   just wants the reason on the record. */
const DECIDE = {
  APPROVE: {
    ask: 'Take this entry off the wiki?',
    verb: 'Approve the removal',
    danger: true,
    says: 'It becomes DELETED — off the index, the lists and its own page. Its '
      + 'history, comments and translations stay, and putting it back is one '
      + 'button on the entry. Every other pending request on it closes with '
      + 'this one, since they were all asking for the same thing.',
  },
  REJECT: {
    ask: 'Turn this request down?',
    verb: 'Reject it',
    danger: false,
    says: 'The entry is untouched and stays where it is. Only this request '
      + 'closes — another one about a different reason can still be made.',
  },
} as const

/** The queue. What a reader sends instead of pressing a Delete button, because
    there is no Delete button anywhere on the wiki: this is the only route that
    leads to an entry coming down, and what it leads to is a person reading it. */
export default function Requests({ onChange }: { onChange: () => void }) {
  const { get, set, offset } = useUrlFilters()
  const [got, setGot] = useState<Page<QueuedRequest> | null>(null)
  const [err, setErr] = useState('')
  const [busy, run] = useAction(setErr)
  const [ask, setAsk] = useState<{ row: QueuedRequest; how: keyof typeof DECIDE } | null>(null)
  const [note, setNote] = useState('')

  const status = get('status', 'PENDING')

  function load() {
    setGot(null)
    setErr('')
    adm.requests({ status, limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(load, [status, offset])

  function decide() {
    if (!ask) return
    run(async () => {
      await adm.decideRequest(ask.row.id, ask.how, note)
      setAsk(null)
      setNote('')
      load()
      /* The rail's waiting-count is now wrong by one. Refreshed here rather
         than optimistically decremented: approving closes the *other* pending
         requests on that entry too, so the count does not move by one and
         guessing it would be a guess. */
      onChange()
    })
  }

  return (
    <div className="page">
      <h1>Delete requests</h1>
      <p className="lede">
        Nobody can remove an entry from the wiki, including whoever wrote it. This
        is where the asking arrives.
      </p>

      <div className="bar">
        <div className="field">
          <label htmlFor="rq-status">Show</label>
          <select
            id="rq-status"
            value={status}
            onChange={(e) => set({ status: e.target.value })}
          >
            {REQUEST_STATUSES.map((s) => (
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
          <Table cols={['Asked', 'Entry', 'Why', 'By', 'From', 'Status', '']}>
            {got.rows.map((r) => (
              <tr key={r.id}>
                <td className="tight">
                  <When at={r.created_at} />
                </td>
                <td className="wide">
                  {r.title ? (
                    <Link to={`/content/${r.post_id}`}>
                      <span className="num">{showValue(r.value ?? '', false)}</span>{' '}
                      {r.title}
                    </Link>
                  ) : (
                    /* purged from a shell -- nothing else removes a row. The
                       request outlives it, which is why it has no foreign key. */
                    <span className="hash">entry {r.post_id}, gone</span>
                  )}
                  {r.post_status && r.post_status !== 'ACTIVE' && (
                    <span className="hash">already {r.post_status.toLowerCase()}</span>
                  )}
                </td>
                <td>
                  <b className="mono small-mono">{r.reason}</b>
                  <div className="hash">{REASON_LABEL[r.reason] ?? ''}</div>
                  {r.detail && <p className="said">{r.detail}</p>}
                </td>
                <td className="tight">{r.requested_by || 'anonymous'}</td>
                <td className="tight">
                  <Hash value={r.ip_hash} />
                </td>
                <td className="tight">
                  <Badge>{r.status}</Badge>
                  {r.decision_note && <div className="hash">{r.decision_note}</div>}
                </td>
                <td className="acts">
                  {r.status === 'PENDING' ? (
                    <>
                      <button
                        className="btn small danger"
                        onClick={() => setAsk({ row: r, how: 'APPROVE' })}
                      >
                        Approve
                      </button>
                      <button
                        className="btn small"
                        onClick={() => setAsk({ row: r, how: 'REJECT' })}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="hash">decided</span>
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
          {status === 'PENDING'
            ? 'Nothing waiting. Nobody has asked for a removal.'
            : 'Nothing here.'}
        </Empty>
      )}

      <Confirm
        open={!!ask}
        title={ask ? DECIDE[ask.how].ask : ''}
        verb={ask ? DECIDE[ask.how].verb : ''}
        danger={ask ? DECIDE[ask.how].danger : false}
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
              <b>{ask.row.reason}</b>
              {ask.row.detail && ` — ${ask.row.detail}`}
            </p>
            <p>{DECIDE[ask.how].says}</p>
            <NoteField
              label="Why (kept in the log, and on the request)"
              value={note}
              onChange={setNote}
              placeholder="Read by the next operator, and by you in a month"
            />
          </>
        )}
      </Confirm>
    </div>
  )
}
