import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, REASON_LABEL, REQUEST_STATUSES } from '../../api'
import { showValue } from '../../format'
import { adm, type Page, type QueuedRequest } from '../api'
import { EntrySheet } from '../sheet'
import { useAction, useQueue, useUrlFilters } from '../state'
import {
  Badge, Confirm, Empty, Fail, Hash, Head, Loading, NoteField, Pager, Row, Table, When,
} from '../ui'

const PER = 50

const COLS = ['Asked', 'Entry', 'Why', 'By', 'From', 'Status', '']

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
    leads to an entry coming down, and what it leads to is a person reading it.

    A row opens the entry beside the asking, which is the only way the question
    can honestly be answered — "somebody says this is their phone number" is
    not a decision until you have read the entry it is about. */
export default function Requests({ onChange }: { onChange: () => void }) {
  const { get, set, offset } = useUrlFilters()
  const [got, setGot] = useState<Page<QueuedRequest> | null>(null)
  const [err, setErr] = useState('')
  const [busy, run] = useAction(setErr)
  const [ask, setAsk] = useState<{ row: QueuedRequest; how: keyof typeof DECIDE } | null>(null)
  const [note, setNote] = useState('')

  const status = get('status', 'PENDING')
  const queue = useQueue(got?.rows)

  function load(quiet = false) {
    if (!quiet) setGot(null)
    setErr('')
    adm.requests({ status, limit: PER, offset })
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
      await adm.decideRequest(ask.row.id, ask.how, note)
      setAsk(null)
      setNote('')
      /* Quiet, so the drawer stays where it is: the decided row drops out and
         the index it vacated is the next request, which is the queue moving
         on by itself rather than the operator finding their place again. */
      load(true)
      /* The rail's waiting-count is now wrong by one. Refreshed rather than
         optimistically decremented: approving closes the *other* pending
         requests on that entry too, so the count does not move by one. */
      onChange()
    })
  }

  const acts = (r: QueuedRequest, small: boolean) => (
    <>
      <button
        className={`btn ${small ? 'small ' : ''}danger`}
        onClick={() => setAsk({ row: r, how: 'APPROVE' })}
      >
        Approve
      </button>
      <button
        className={`btn ${small ? 'small' : ''}`}
        onClick={() => setAsk({ row: r, how: 'REJECT' })}
      >
        Reject
      </button>
    </>
  )

  return (
    <div className="page">
      <Head
        title="Delete requests"
        tally={got && `${got.total} ${status === 'ALL' ? 'in all' : status.toLowerCase()}`}
        hint="Nobody can remove an entry from the wiki, including whoever wrote
              it. This is where the asking arrives."
      />

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
        <span className="hash push self">
          Click a row to read the entry beside the request · ↑↓ to move
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
                key={r.id}
                className={queue.at === i ? 'lit' : ''}
                onOpen={() => queue.open(i)}
              >
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
                <td className="wide">
                  {/* One line of it. What a stranger typed can be a thousand
                      characters and used to set the height of the row it was
                      on; the whole of it is in the sheet, next to the entry it
                      is about, which is where it can actually be judged. */}
                  <b className="mono small-mono" title={REASON_LABEL[r.reason] ?? r.reason}>
                    {r.reason}
                  </b>
                  {r.detail && <span className="said-line" title={r.detail}>{r.detail}</span>}
                </td>
                <td className="tight">{r.requested_by || 'anonymous'}</td>
                <td className="tight">
                  <Hash value={r.ip_hash} to={r.ip_hash ? `/changes?ip=${r.ip_hash}&kind=all` : undefined} />
                </td>
                <td className="tight">
                  <Badge>{r.status}</Badge>
                </td>
                <td className="acts">
                  {r.status === 'PENDING' ? acts(r, true) : <span className="hash">decided</span>}
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
          {status === 'PENDING'
            ? 'Nothing waiting. Nobody has asked for a removal.'
            : 'Nothing here.'}
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
        {queue.row?.status === 'PENDING' && acts(queue.row, false)}
      </EntrySheet>

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
