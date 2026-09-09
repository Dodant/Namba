import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, entryPath, type Format, type Post } from '../api'
import { canonicalNumber, showValue } from '../format'
import { useAsync } from '../useAsync'
import { useUi } from '../uiLocale'

/* A lookup should answer after a short pause, not once per keystroke. Apart
   from saving requests, this keeps the panel from saying "nothing here" while
   a reader is halfway through writing 1,000 or 11/22/63. */
function useDebouncedValue(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** The quiet answer beneath a new entry's value.

    A number page is a column, not an entry: people can add another meaning
    safely, but should be able to see what is already in that column before
    writing a duplicate. Abbreviations use their own section for the same
    reason `/a/UFO` and `/n/UFO` are separate pages. */
export default function ExistingEntries({
  value,
  format,
  locale,
}: {
  value: string
  format: '' | Format
  locale: string
}) {
  const { m } = useUi()
  const debounced = useDebouncedValue(value)
  const lookupValue = canonicalNumber(debounced, locale).value
  const section = format === 'ABBR' ? 'abbr' : format ? 'number' : undefined
  // Never leave an answer for the previous value under the value now being
  // typed. The panel returns after this input has settled for one beat.
  const ready = value === debounced && Boolean(lookupValue)
  const found = useAsync(
    () => ready ? api.posts({ value: lookupValue, section, limit: 50 }) : Promise.resolve<Post[]>([]),
    [lookupValue, section, ready],
  )
  const posts = found.data ?? []

  if (!ready || found.loading || found.err || !posts.length) return null

  const grouped = posts.every((post) => post.grouped)
  const shownValue = showValue(lookupValue, grouped, locale)
  const browse = entryPath(lookupValue, posts[0].format)
  const shown = posts.slice(0, 3)
  const more = posts.length - shown.length

  return (
    <aside className="existing" aria-live="polite" aria-atomic="true">
      <p className="existing-lead">
        <Link className="existing-value" to={browse}>
          {shownValue}
        </Link><span aria-hidden="true"> · </span>
        {m.browse.summary(posts.length, section === 'abbr')}
      </p>
      <ul>
        {shown.map((post) => (
          <li key={post.id}>
            <Link to={`/p/${post.id}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link className="existing-more" to={browse}>
          {m.post.more(more)}
        </Link>
      )}
    </aside>
  )
}
