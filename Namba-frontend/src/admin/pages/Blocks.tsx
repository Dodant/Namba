import { useEffect, useState } from 'react'
import { errorText, fmtDate } from '../../api'
import { adm, type Block, type Page } from '../api'
import { Confirm, Empty, Hash, Pager, Table, When } from '../ui'

const PER = 100

/** Who cannot write, and who could not before.

    Lifted and expired blocks stay on the list, which is what `lifted_at` is
    for: "we blocked this and then let it back in" is something an operator
    needs to be able to look up, and a row that vanished says only "we never
    did". So the filter defaults to the live ones and All is one click away. */
export default function Blocks() {
  const [live, setLive] = useState(true)
  const [offset, setOffset] = useState(0)
  const [got, setGot] = useState<Page<Block> | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<Block | null>(null)

  function load() {
    setGot(null)
    setErr('')
    adm.blocks({ live: live ? 'true' : 'false', limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(load, [live, offset])

  async function lift() {
    if (!ask) return
    setBusy(true)
    try {
      await adm.liftBlock(ask.id)
      setAsk(null)
      load()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Blocked clients</h1>
      <p className="lede">
        A block stops writing and nothing else. It is on a browser or an address,
        never on a person — nobody here has an account — which is why they
        expire and why permanent has to be chosen.
      </p>

      <div className="bar">
        <button
          className={`btn ${live ? 'on' : ''}`}
          aria-pressed={live}
          onClick={() => {
            setLive(true)
            setOffset(0)
          }}
        >
          In force
        </button>
        <button
          className={`btn ${live ? '' : 'on'}`}
          aria-pressed={!live}
          onClick={() => {
            setLive(false)
            setOffset(0)
          }}
        >
          Everything ever
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
          <Table cols={['Kind', 'Target', 'Why', 'Since', 'Until', 'By', 'State', '']}>
            {got.rows.map((b) => (
              <tr key={b.id} className={b.live ? '' : 'dim'}>
                <td className="tight">
                  <span className="badge">{b.type}</span>
                </td>
                <td className="tight">
                  <Hash value={b.target_hash} />
                </td>
                <td className="wide">
                  <span title={b.reason}>{b.reason || '—'}</span>
                </td>
                <td className="tight">
                  <When at={b.created_at} />
                </td>
                <td className="tight">
                  {b.expires_at ? (
                    <span className="when" title={b.expires_at}>
                      {fmtDate(b.expires_at)}
                    </span>
                  ) : (
                    <span className="badge bad">never</span>
                  )}
                </td>
                <td className="tight">{b.by ?? '—'}</td>
                <td className="tight">
                  {b.lifted_at ? (
                    <span className="hash" title={b.lifted_at}>
                      lifted {fmtDate(b.lifted_at)}
                    </span>
                  ) : b.live ? (
                    <span className="badge bad">IN FORCE</span>
                  ) : (
                    <span className="hash">expired</span>
                  )}
                </td>
                <td className="acts">
                  {b.live ? (
                    <button className="btn small" onClick={() => setAsk(b)}>
                      Lift
                    </button>
                  ) : (
                    <span className="hash">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pager total={got.total} limit={PER} offset={offset} onGo={setOffset} />
        </>
      ) : (
        <Empty>{live ? 'Nobody is blocked.' : 'Nobody has ever been blocked.'}</Empty>
      )}

      <Confirm
        open={!!ask}
        title="Lift this block?"
        verb="Lift it"
        busy={busy}
        onCancel={() => setAsk(null)}
        onOk={lift}
      >
        <p>
          They can write again immediately. The row stays on this list marked
          lifted, because "we blocked this and then let it back in" is worth being
          able to read later.
        </p>
        {ask && (
          <p className="quoted">
            {ask.type} <b>{ask.target_hash.slice(0, 8)}…</b>
            {ask.reason && ` — ${ask.reason}`}
          </p>
        )}
      </Confirm>
    </div>
  )
}
