import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, POST_STATUSES } from '../../api'
import { showValue } from '../../format'
import { adm, type Page, type Row } from '../api'
import { useUrlFilters } from '../state'
import { Badge, Empty, Pager, Table, When } from '../ui'

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

/** Every entry on the wiki, hidden ones included -- the one list in the whole
    codebase that does not filter on status, which is the point of it.

    The filters live in the URL rather than in state, the same call the wiki
    makes for its feed toggle: a view of "everything flagged, oldest first"
    survives a reload, can be bookmarked, and can be sent to somebody. */
export default function Content() {
  const { get, set, offset } = useUrlFilters()
  const [got, setGot] = useState<Page<Row> | null>(null)
  const [err, setErr] = useState('')
  /* The box is local and the URL is the committed search: typing straight into
     the query would fire a request per keystroke and put every prefix of the
     word in the history. Enter commits. */
  const [box, setBox] = useState(get('q'))

  const q = get('q')
  const status = get('status', 'ALL')
  const flagged = get('flagged') === '1'
  const sort = get('sort', 'updated')

  useEffect(() => {
    setGot(null)
    setErr('')
    adm.posts({ q, status, flagged: flagged ? 1 : undefined, sort, limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }, [q, status, flagged, sort, offset])

  return (
    <div className="page">
      <h1>All content</h1>
      <p className="lede">
        Every entry, including the ones that are off the wiki. Only the
        exceptions carry a badge, so a row reading “on the wiki” is a row with
        nothing wrong with it. FLAGGED means an open report — a count rather than
        a state, so it clears when the reports do.
      </p>

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
            placeholder="A number, a title, anything in a body…"
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

      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}

      {!got ? (
        !err && <Empty>Loading…</Empty>
      ) : got.rows.length ? (
        <>
          <Table
            cols={['Number', 'Title', 'Status', 'Written by', 'Touched', 'Flags']}
          >
            {got.rows.map((r) => (
              <tr key={r.id}>
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
                      a status column is for. The lede says what blank means. */}
                  {r.status !== 'ACTIVE' && <Badge>{r.status}</Badge>}
                  {r.status !== 'ACTIVE' && !!r.open_reports && ' '}
                  {!!r.open_reports && <Badge>FLAGGED</Badge>}
                  {r.status === 'ACTIVE' && !r.open_reports && (
                    <span className="hash">on the wiki</span>
                  )}
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
          Nothing matches. {q && `No entry mentions “${q}”.`}
        </Empty>
      )}
    </div>
  )
}
