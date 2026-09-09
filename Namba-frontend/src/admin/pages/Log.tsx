import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorText } from '../../api'
import { adm, type Event, type Page } from '../api'
import { LogTable } from '../log'
import { Empty, Pager } from '../ui'

const PER = 60

/** Recent changes and the audit log: the same rows read with two filters.

    One page and one component because they *are* one thing -- `events` holds
    every write on both sides of the wiki, and `admin_id` being null or set is
    the entire difference. Two pages with two tables would have been two places
    to fix the day a new action is added. */
export default function Log({ kind }: { kind: 'anon' | 'admin' }) {
  const [params, setParams] = useSearchParams()
  const [got, setGot] = useState<Page<Event> | null>(null)
  const [err, setErr] = useState('')
  const offset = Number(params.get('offset') ?? 0)

  useEffect(() => {
    setGot(null)
    setErr('')
    adm.activity({ kind, limit: PER, offset })
      .then(setGot, (e) => setErr(errorText(e)))
  }, [kind, offset])

  /* Switching between the two pages has to drop the window with it: page 4 of
     the audit log is not page 4 of recent changes. The route changes, so the
     effect reruns -- but the offset would ride along in the query string. */
  useEffect(() => {
    if (params.get('offset')) {
      const p = new URLSearchParams(params)
      p.delete('offset')
      setParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  return (
    <div className="page">
      <h1>{kind === 'admin' ? 'Audit log' : 'Recent changes'}</h1>
      <p className="lede">
        {kind === 'admin' ? (
          <>
            Every decision an operator has made, and it cannot be edited from
            anywhere: nothing in this codebase updates or deletes a row of the
            log. That is the point of it — an audit trail an operator can tidy
            is not one.
          </>
        ) : (
          <>
            Every write a visitor has made to the wiki, newest first. Likes are
            not here: at a row per tap this page would be nothing else.
          </>
        )}
      </p>

      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}

      {!got ? (
        !err && <Empty>Loading…</Empty>
      ) : (
        <>
          <LogTable rows={got.rows} />
          <Pager
            total={got.total}
            limit={PER}
            offset={offset}
            onGo={(next) => {
              const p = new URLSearchParams(params)
              p.set('offset', String(next))
              setParams(p)
            }}
          />
        </>
      )}
    </div>
  )
}
