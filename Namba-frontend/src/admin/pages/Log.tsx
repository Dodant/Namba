import { useEffect, useState } from 'react'
import { errorText } from '../../api'
import { ACTION_LABEL, adm, type Event, type Operator, type Page } from '../api'
import { LogTable } from '../log'
import { useUrlFilters } from '../state'
import { Empty, Fail, Head, Loading, Pager } from '../ui'

const PER = 60

const COLS = ['When', 'Who', 'Did', 'To', 'From']

/* An operator's own decisions carry these five prefixes and a visitor's write
   carries none of them, which is the same split `kind` makes on `admin_id` --
   so the two lists in the dropdown agree with the filter beside them instead
   of offering EDIT under Operators, where it can never match. */
const OPERATOR_ACTION = /^(ADMIN|CONTENT|REQUEST|REPORT|CLIENT)_/

const WINDOWS = [
  { hours: '', label: 'All time' },
  { hours: '1', label: 'Last hour' },
  { hours: '24', label: 'Last day' },
  { hours: `${24 * 7}`, label: 'Last week' },
  { hours: `${24 * 30}`, label: 'Last month' },
]

const TITLE = { anon: 'Recent changes', admin: 'Audit log', all: 'Everything logged' }

/* Keyed on the kind actually being shown and not on the route, because the
   route is only the default: a link that widens `kind` to `all` was landing
   on a heading that said so over a sentence that still said "every write a
   visitor has made". */
const HINT = {
  anon: 'Every write a visitor has made. Likes are not here: at a row per tap'
    + ' this page would be nothing else.',
  admin: 'Nothing in this codebase updates or deletes a row of it — an audit'
    + ' trail an operator can tidy is not one.',
  all: 'All three kinds of row: a visitor wrote something, an operator decided'
    + ' something, or the server fell over.',
}

/** Recent changes and the audit log: the same rows read with two filters.

    One page and one component because they *are* one thing -- `events` holds
    every write on both sides of the wiki, and `admin_id` being null or set is
    the entire difference. Two pages with two tables would have been two places
    to fix the day a new action is added.

    The route picks which one you land on and the filters can widen it back
    out, which is what makes a hash or an entry id linkable into here at all:
    "everything this address did" and "everything that happened to entry 42"
    both cross the split, and neither has a page of its own to need building.
*/
export default function Log({ kind: fallback }: { kind: 'anon' | 'admin' }) {
  const { get, set, offset } = useUrlFilters()
  const [got, setGot] = useState<Page<Event> | null>(null)
  const [ops, setOps] = useState<Operator[]>([])
  const [err, setErr] = useState('')

  const kind = get('kind', fallback)
  const action = get('action')
  const who = get('who')
  const ip = get('ip')
  const post = get('post')
  const hours = get('hours')

  function load() {
    setGot(null)
    setErr('')
    adm.activity({
      kind, action, hours, limit: PER, offset,
      admin_id: who || undefined,
      ip_hash: ip || undefined,
      target_type: post ? 'post' : undefined,
      target_id: post || undefined,
    }).then(setGot, (e) => setErr(errorText(e)))
  }

  useEffect(load, [kind, action, who, ip, post, hours, offset])

  /* Only where it can be used. An operator's email is what makes "who" a
     dropdown rather than a number to type, and the visitors feed has no
     operators in it by construction. */
  useEffect(() => {
    if (kind !== 'anon' && !ops.length) adm.admins().then(setOps, () => setOps([]))
  }, [kind, ops.length])

  /* Switching route has to drop the window with it: page 4 of the audit log is
     not page 4 of recent changes. The route changes, so the effect above
     reruns -- but the offset would ride along in the query string. */
  useEffect(() => {
    if (get('offset')) set({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback])

  const verbs = Object.keys(ACTION_LABEL).filter((a) =>
    kind === 'all' || a === 'ERROR'
      ? true
      : OPERATOR_ACTION.test(a) === (kind === 'admin'))
  const narrowed = !!(action || who || ip || post || hours) || kind !== fallback

  return (
    <div className="page">
      <Head
        title={TITLE[kind as keyof typeof TITLE] ?? TITLE[fallback]}
        tally={got && `${got.total} rows`}
        hint={HINT[kind as keyof typeof HINT] ?? HINT[fallback]}
      />

      <div className="bar">
        <div className="field">
          <label htmlFor="lg-kind">Whose</label>
          <select id="lg-kind" value={kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="anon">Visitors</option>
            <option value="admin">Operators</option>
            <option value="all">Everything, crashes included</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="lg-action">Did what</label>
          <select id="lg-action" value={action} onChange={(e) => set({ action: e.target.value })}>
            <option value="">Anything</option>
            {verbs.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        {kind !== 'anon' && (
          <div className="field">
            <label htmlFor="lg-who">Operator</label>
            <select id="lg-who" value={who} onChange={(e) => set({ who: e.target.value })}>
              <option value="">Anyone</option>
              {ops.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.email}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="lg-when">Since</label>
          <select id="lg-when" value={hours} onChange={(e) => set({ hours: e.target.value })}>
            {WINDOWS.map((w) => (
              <option key={w.label} value={w.hours}>
                {w.label}
              </option>
            ))}
            {/* A hand-typed or linked window that is not one of the five. A
                `<select>` whose value matches no option shows the first one,
                so without this the control says "all time" while the list is
                filtered -- which is the one thing a filter must never do. */}
            {hours && !WINDOWS.some((w) => w.hours === hours) && (
              <option value={hours}>Last {hours} hours</option>
            )}
          </select>
        </div>
        {/* The two that arrive from a link rather than from this bar, so they
            show as something to take off again -- a filter an operator did not
            set and cannot see is a log that looks mysteriously short. */}
        {ip && (
          <button className="btn on" onClick={() => set({ ip: null })}>
            client {ip.slice(0, 8)}… ✕
          </button>
        )}
        {post && (
          <button className="btn on" onClick={() => set({ post: null })}>
            entry {post} ✕
          </button>
        )}
        {narrowed && (
          <button
            className="btn push"
            onClick={() => set({ kind: null, action: null, who: null, ip: null,
                                 post: null, hours: null })}
          >
            Clear filters
          </button>
        )}
      </div>

      <Fail msg={err} onRetry={load} />

      {!got ? (
        !err && <Loading cols={COLS} />
      ) : got.rows.length ? (
        <>
          <LogTable rows={got.rows} />
          <Pager
            total={got.total}
            limit={PER}
            offset={offset}
            onGo={(next) => set({ offset: String(next) })}
          />
        </>
      ) : (
        <Empty>Nothing matches those filters.</Empty>
      )}
    </div>
  )
}
