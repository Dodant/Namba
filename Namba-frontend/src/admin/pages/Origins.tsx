import { useEffect, useState } from 'react'
import { errorText, POST_STATUSES } from '../../api'
import { adm, type OriginRow, type Page } from '../api'
import { useAction, useUrlFilters } from '../state'
import { Badge, Confirm, Empty, Fail, Head, Loading, NoteField, Pager, Table, When } from '../ui'

const PER = 50

const COLS = ['Name', 'Came from', 'Story', 'By', 'When', 'Status', '']

/** Every link on the Origins tab, hidden ones included.

    One row is one link, never a chain: a chain is only links that happen to
    meet, so hiding one cuts the chain there and takes nothing else with it.
    The story is shown whole and as typed, for the reason an entry's body is
    shown as source -- judging one is reading what a stranger wrote. */
export default function Origins() {
  const { get, set, offset } = useUrlFilters()
  const q = get('q')
  const status = get('status', 'ALL')
  const [box, setBox] = useState(q)
  const [got, setGot] = useState<Page<OriginRow> | null>(null)
  const [err, setErr] = useState('')
  const [said, setSaid] = useState('')
  const [busy, run] = useAction(setSaid)
  const [ask, setAsk] = useState<OriginRow | null>(null)
  const [note, setNote] = useState('')

  function load() {
    setErr('')
    adm.origins({ q, status, limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(load, [q, status, offset])

  const hiding = ask?.status === 'ACTIVE'

  function decide() {
    if (!ask) return
    run(async () => {
      await adm.setOriginStatus(ask.id, hiding ? 'HIDDEN' : 'ACTIVE', note)
      setAsk(null)
      setNote('')
      load()
    })
  }

  return (
    <div className="page">
      <Head
        title="Origins"
        tally={got && `${got.total} links`}
        hint="One row is one link between two names. Hiding one takes it off
              the wiki and cuts any chain at that point; nothing is removed, and
              putting it back is this same button."
      />

      <div className="bar">
        <form
          className="field grow"
          onSubmit={(e) => {
            e.preventDefault()
            set({ q: box.trim() })
          }}
        >
          <label htmlFor="og-q">Search</label>
          <input
            id="og-q"
            type="search"
            value={box}
            placeholder="A name, where it came from, anything in a story…"
            onChange={(e) => setBox(e.target.value)}
          />
        </form>
        <div className="field">
          <label htmlFor="og-status">Status</label>
          <select id="og-status" value={status} onChange={(e) => set({ status: e.target.value })}>
            <option value="ALL">All</option>
            {POST_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <Fail msg={err} onRetry={load} />

      {!got ? (
        !err && <Loading cols={COLS} rows={5} />
      ) : got.rows.length ? (
        <>
          <Table cols={COLS}>
            {got.rows.map((o) => (
              <tr key={o.id} className={o.status === 'ACTIVE' ? '' : 'dim'}>
                <td>
                  <b>{o.name}</b>
                  {o.name_note && <span className="hash"> · {o.name_note}</span>}
                </td>
                <td>
                  {o.origin}
                  {o.origin_note && <span className="hash"> · {o.origin_note}</span>}
                </td>
                <td className="wide">{o.body}</td>
                <td className="tight">
                  {o.author}
                  {o.lang && <span className="hash"> · {o.lang}</span>}
                </td>
                <td className="tight"><When at={o.created_at} /></td>
                <td className="tight"><Badge>{o.status}</Badge></td>
                <td className="acts">
                  <button
                    className="btn small"
                    onClick={() => {
                      setSaid('')
                      setAsk(o)
                    }}
                  >
                    {o.status === 'ACTIVE' ? 'Hide' : 'Put back'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <Pager total={got.total} limit={PER} offset={offset}
                 onGo={(n) => set({ offset: String(n) })} />
        </>
      ) : (
        <Empty>{q || status !== 'ALL' ? 'Nothing matches.' : 'Nobody has filed an origin yet.'}</Empty>
      )}

      <Confirm
        open={!!ask}
        title={hiding ? 'Hide this link?' : 'Put this link back?'}
        verb={hiding ? 'Hide it' : 'Put it back'}
        danger={hiding}
        busy={busy}
        onCancel={() => setAsk(null)}
        onOk={decide}
      >
        <p>
          {hiding
            ? 'It leaves the Origins tab and any chain it was part of stops there. The row stays, and this same button puts it back.'
            : 'It returns to the Origins tab as it was. A link that would now close a loop is refused.'}
        </p>
        {ask && (
          <p className="quoted">
            <b>{ask.name}</b> ← {ask.origin}
          </p>
        )}
        <NoteField label="Note" value={note} placeholder="Why — kept in the audit log"
                   onChange={setNote} />
        {/* in the dialog, not behind it: the page under a modal is inert */}
        {said && <p className="err" role="alert">{said}</p>}
      </Confirm>
    </div>
  )
}
