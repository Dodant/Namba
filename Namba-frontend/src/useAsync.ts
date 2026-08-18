/* oxlint-disable react-hooks/exhaustive-deps -- this hook forwards its caller's
   deps array, which is exactly what the rule cannot statically verify. */
import { useEffect, useState } from 'react'

/** Load-once-per-dep-change fetch state. Used by every page, hence a hook. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; err?: string; loading: boolean }>({
    loading: true,
  })
  useEffect(() => {
    let alive = true
    setState({ loading: true })
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (e: Error) => alive && setState({ err: e.message, loading: false }),
    )
    return () => {
      alive = false
    }
  }, deps)
  return state
}
