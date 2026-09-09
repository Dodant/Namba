/** The two things every page in the panel does besides drawing a table.

    Here rather than in `ui.tsx` because that file exports components, and a
    module mixing the two loses fast refresh for both -- which is a cost paid
    on every edit to a badge.
*/
import { useState } from 'react'
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
