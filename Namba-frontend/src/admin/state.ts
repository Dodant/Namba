/** The two things every page in the panel does besides drawing a table.

    Here rather than in `ui.tsx` because that file exports components, and a
    module mixing the two loses fast refresh for both -- which is a cost paid
    on every edit to a badge.
*/
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { errorText } from '../api'

/** List filters, held in the URL rather than in state, so a view of
    "everything flagged, oldest first" survives a reload, can be bookmarked and
    can be sent to somebody.

    `set` is why this is shared. **Any filter change clears `offset`**, because
    page 4 of the old filter is not page 4 of the new one and landing past the
    end of a shorter list reads as "nothing matched" when the answer was three
    rows back. Written once here, because five pages hand-rolling the same
    two lines is five places for the rule to go missing. Pass `offset` itself
    in `next` to page without resetting. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams()
  return {
    get: (key: string, fallback = '') => params.get(key) ?? fallback,
    offset: Number(params.get('offset') ?? 0),
    set(next: Record<string, string | null>, opts?: { replace?: boolean }) {
      const p = new URLSearchParams(params)
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === '') p.delete(k)
        else p.set(k, v)
      }
      if (!('offset' in next)) p.delete('offset')
      setParams(p, opts)
    },
  }
}

/** Do the thing, and say so while it happens.

    Every decision in the panel is the same shape: the dialog's button goes to
    "Working…", the request goes out, and either the page reloads or the reason
    it did not stays where the operator can read it. Every handler in the
    panel is those seven lines, so they are here once. The error setter is
    passed in rather than owned here
    because each page already has one, and on Entry that same string is drawn
    twice -- once on the page and once inside a modal that makes the page
    behind it unreadable. Nothing clears it on the way in, deliberately: the
    two callers that want that do it themselves, and the rest are behind a
    button that is disabled while `busy`. */
export function useAction(onError: (message: string) => void) {
  const [busy, setBusy] = useState(false)
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      onError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return [busy, run] as const
}

/** Where the drawer is standing in a list, and how it moves.

    Every queue in the panel is the same three lines: which row is open, step
    to the neighbour, and stop at both ends. Written once because getting the
    clamp wrong is what makes a Next button at the bottom of a page wrap round
    to the top and lose an operator their place -- and because "3 of 24" has to
    agree with the row that is actually open.

    Keyed by position rather than by id: the row a decision closes drops out of
    the list, so the *next* item lands on the index just vacated, which is the
    behaviour a queue wants. `null` is closed.
*/
export function useQueue<T>(rows: T[] | undefined) {
  const [at, setAt] = useState<number | null>(null)
  const here = at != null && at < (rows?.length ?? 0) ? at : null
  return {
    at: here,
    row: here == null ? undefined : rows?.[here],
    /** "3 of 24" for the drawer's heading. */
    label: here == null ? undefined : `${here + 1} of ${rows?.length ?? 0}`,
    open: setAt,
    close: useCallback(() => setAt(null), []),
    step: useCallback((by: 1 | -1) => {
      setAt((was) => {
        if (was == null) return was
        const next = was + by
        /* Both ends stop rather than wrap. A queue that loops has no end, and
           an operator who cannot tell they have reached one works it twice. */
        return next < 0 || next >= (rows?.length ?? 0) ? was : next
      })
    }, [rows]),
  }
}
