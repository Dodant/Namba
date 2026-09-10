import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, POST_STATUSES, type PostStatus } from '../../api'
import { showValue } from '../../format'
import { adm, type Page, type Row as Entry } from '../api'
import { EntrySheet } from '../sheet'
import { useAction, useQueue, useUrlFilters } from '../state'
import {
  Badge, Confirm, Empty, Fail, Head, Loading, NoteField, Pager, Row, Table, When,
} from '../ui'

const PER = 50

/* Which column, and which way it means. Only four, and none of them is
   "sort by anything you click": a title sorted alphabetically answers no
   question an operator has, and a column head that sorts is a promise that it
   is worth sorting by. */
const SORTS = [
  { key: 'updated', label: 'Last touched' },
  { key: 'created', label: 'Newest' },
  { key: 'reports', label: 'Most flagged' },
  { key: 'number', label: 'By number' },
]

/* What a selection can be moved to, and how loudly to ask. Restoring is the
   undo of both of the others, which is why it is the one that is not red. */
const BULK: { to: PostStatus; label: string; danger: boolean; says: string }[] = [
  { to: 'HIDDEN', label: 'Take off the wiki', danger: true,
    says: 'Each one leaves the index, the lists and its own page. Histories, '
      + 'comments and translations are untouched, and putting them back is '
      + 'the third button here.' },
  { to: 'DELETED', label: 'Mark removed', danger: true,
    says: 'The same as hiding, and it reads differently in the list: removed '
      + 'means somebody asked and you agreed. Nothing is deleted.' },
  { to: 'ACTIVE', label: 'Put back', danger: false,
    says: 'Each one returns whole, at the same address, with everything that '
      + 'was attached to it.' },
]

const COLS = ['', 'Number', 'Title', 'Status', 'Written by', 'Touched', 'Flags']

/** Every entry on the wiki, hidden ones included -- the one list in the whole
    codebase that does not filter on status, which is the point of it.

    The filters live in the URL rather than in state, the same call the wiki
    makes for its feed toggle: a view of "everything flagged, oldest first"
    survives a reload, can be bookmarked, and can be sent to somebody.

    Selection is here and not on the queues because this is the list a spam
    wave lands in: twenty entries under twenty numbers, found by one search,
    and taking them off the wiki used to be twenty page loads. */
export default function Content() {
  const { get, set, offset } = useUrlFilters()
  const [got, setGot] = useState<Page<Entry> | null>(null)
  const [err, setErr] = useState('')
  const [busy, run] = useAction(setErr)
  /* The box is local and the URL is the committed search: typing straight into
     the query would fire a request per keystroke and put every prefix of the
     word in the history. Enter commits. */
  const [box, setBox] = useState(get('q'))
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [ask, setAsk] = useState<(typeof BULK)[number] | null>(null)
  const [note, setNote] = useState('')

  const q = get('q')
  const status = get('status', 'ALL')
  const flagged = get('flagged') === '1'
  const sort = get('sort', 'updated')
  const queue = useQueue(got?.rows)

  function load(quiet = false) {
    if (!quiet) setGot(null)
    setErr('')
    adm.posts({ q, status, flagged: flagged ? 1 : undefined, sort, limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(() => {
    load()
    /* A selection is of rows on a page, so it cannot outlive the page. Left
       standing across a filter change it would be a set of ids the operator
       can no longer see, aimed at by a button that says "12 selected". */
    setPicked(new Set())
    queue.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, flagged, sort, offset])

  function pick(id: number, on: boolean) {
    setPicked((was) => {
      const next = new Set(was)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function bulk() {
    if (!ask) return
    run(async () => {
      /* ponytail: one request per entry, in order. The audit log wants a row
         each whatever happens, so a bulk route would only save round trips --
         and fifty of those against one SQLite writer is a queue with extra
         steps. Add a real batch route if a page ever holds thousands. */
      let moved = 0
      let already = 0
      let last = ''
      for (const id of picked) {
        try {
          await adm.setStatus(id, ask.to, note)
          moved++
        } catch (e) {
          /* 409 is "it is already that", which on a selection of twenty is
             the ordinary case rather than a failure worth shouting about. */
          const why = errorText(e)
          if (/already/i.test(why)) already++
          else {
            last = why
            break
          }
        }
      }
      setAsk(null)
      setNote('')
      setPicked(new Set())
      load(true)
      setErr(last || (already
        ? `${moved} moved, ${already} already ${ask.to.toLowerCase()}.`
        : ''))
    })
  }

  const rows = got?.rows ?? []
  const allOn = !!rows.length && rows.every((r) => picked.has(r.id))

  return (
    <div className="page">
      <Head
        title="All content"
        tally={got && `${got.total} entries`}
        hint="A blank status is an entry with nothing wrong with it. FLAGGED
              means an open report — a count rather than a state, so it clears
              when the reports do."
      />

      <div className="bar">
        <form
          className="field grow"
          onSubmit={(e) => {
            e.preventDefault()
            set({ q: box.trim() })
          }}
        >
          <label htmlFor="ct-q">Search</label>
          <input
            id="ct-q"
            type="search"
            value={box}
            placeholder="A number, a title, anything in a body…   (press /)"
            onChange={(e) => setBox(e.target.value)}
          />
        </form>
        <div className="field">
          <label htmlFor="ct-status">Status</label>
          <select
            id="ct-status"
            value={status}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="ALL">All</option>
            {POST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ct-sort">Order</label>
          <select id="ct-sort" value={sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          className={`btn ${flagged ? 'on' : ''}`}
          aria-pressed={flagged}
          onClick={() => set({ flagged: flagged ? null : '1' })}
        >
          Flagged only
        </button>
      </div>

      {/* Only once something is selected, and it takes the place of nothing:
          a permanently visible bar of disabled bulk buttons is a row of
          controls an operator learns to look past. */}
      {!!picked.size && (
        <div className="picked" role="status">
          <b>{picked.size} selected</b>
          {BULK.map((b) => (
            <button
              key={b.to}
              className={`btn small ${b.danger ? 'danger' : ''}`}
              onClick={() => setAsk(b)}
            >
              {b.label}
            </button>
          ))}
          <button className="btn small push" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      <Fail msg={err} onRetry={() => load()} />

      {!got ? (
        !err && <Loading cols={COLS} />
      ) : rows.length ? (
        <>
          <Table
            cols={[
              <input
                key="all"
                type="checkbox"
                aria-label="Select every row on this page"
                checked={allOn}
                onChange={(e) =>
                  setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
              />,
              ...COLS.slice(1),
            ]}
          >
            {rows.map((r, i) => (
              <Row
                key={r.id}
                className={queue.at === i ? 'lit' : ''}
                onOpen={() => queue.open(i)}
              >
                <td className="tight">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.title}`}
                    checked={picked.has(r.id)}
                    onChange={(e) => pick(r.id, e.target.checked)}
                  />
                </td>
                <td className="tight num">
                  {/* the entry's own spelling of its number -- grouped is how
                      it asked to be written, and a table that ignores that
                      shows a different number from the wiki */}
                  {showValue(r.value, !!r.grouped)}
                </td>
                <td className="wide">
                  <Link to={`/content/${r.id}`}>{r.title}</Link>
                </td>
                <td className="tight">
                  {/* Only the exceptions get a badge. Almost every row is
                      ACTIVE, and a hundred and eighty green pills is a column
                      an operator stops seeing -- which is the opposite of what
                      a status column is for. The hint says what blank means. */}
                  {r.status !== 'ACTIVE' && <Badge>{r.status}</Badge>}
                  {r.status !== 'ACTIVE' && !!r.open_reports && ' '}
                  {!!r.open_reports && <Badge>FLAGGED</Badge>}
                </td>
                <td className="tight">
                  {r.author}
                  {r.edited_by && r.edited_by !== r.author && (
                    <span className="hash"> · last {r.edited_by}</span>
                  )}
                </td>
                <td className="tight">
                  <When at={r.updated_at} />
                </td>
                <td className="tight right num">
                  {/* Two counts in one column, and the letters say which: a
                      bare "2 / 1" needs a legend and a legend needs reading.
                      Blank when there are none -- a dash on a hundred and
                      eighty rows is the same noise the status badges were. */}
                  {!!r.open_reports && <span title="open reports">{r.open_reports}r</span>}
                  {!!r.open_reports && !!r.pending_requests && ' '}
                  {!!r.pending_requests && (
                    <span title="pending delete requests">{r.pending_requests}d</span>
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
          Nothing matches. {q && `No entry mentions “${q}”.`}
        </Empty>
      )}

      <EntrySheet
        postId={queue.row?.id ?? null}
        at={queue.label}
        onStep={queue.step}
        onClose={queue.close}
        onChanged={() => load(true)}
      />

      <Confirm
        open={!!ask}
        title={ask ? `${ask.label} — ${picked.size} entries?` : ''}
        verb={ask?.label ?? ''}
        danger={ask?.danger}
        busy={busy}
        onCancel={() => {
          setAsk(null)
          setNote('')
        }}
        onOk={bulk}
      >
        <p>{ask?.says}</p>
        <p className="quoted">
          {/* Named, not counted. Twenty ids behind the word "selected" is a
              button an operator presses hoping, and the one row that got in
              by a misclick is the one this is here to catch. */}
          {rows.filter((r) => picked.has(r.id)).map((r) => r.title).join(' · ')}
        </p>
        <NoteField
          label="Why (kept in the log, on every one of them)"
          value={note}
          onChange={setNote}
          placeholder="Optional, and read by the next operator"
        />
      </Confirm>
    </div>
  )
}
