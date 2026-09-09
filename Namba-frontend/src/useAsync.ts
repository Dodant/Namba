/* oxlint-disable react-hooks/exhaustive-deps -- this hook forwards its caller's
   deps array, which is exactly what the rule cannot statically verify. */
import { useEffect, useState } from 'react'
import { errorText } from './api'

/** Load-once-per-dep-change fetch state. Used by every page, hence a hook.

    `keep` holds the last answer on screen while the next one loads, for the
    callers whose deps only ever re-filter one list. Without it the index fell
    from 8000px to a 400px "Loading…" and back for one click on a format tab:
    two layout jumps and a lost scroll position, on every filter change.

    It is off by default because most callers are not filtering, they are
    changing the subject -- another number, another entry -- and last
    subject's answer under this subject's heading is worse than a blank. The
    ones that opt in have to label their rows off the rows, not off the deps
    (see `shownFormat` in `Home`). The error is never kept either way: it
    belonged to the request that failed. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], keep = false) {
  const [state, setState] = useState<{ data?: T; err?: string; loading: boolean }>({
    loading: true,
  })
  useEffect(() => {
    let alive = true
    setState((s) => (keep ? { data: s.data, loading: true } : { loading: true }))
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (e) => alive && setState({ err: errorText(e), loading: false }),
    )
    return () => {
      alive = false
    }
  }, deps)
  return state
}
