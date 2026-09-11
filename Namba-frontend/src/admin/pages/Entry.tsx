import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorText, FORMATS, tagLabel, type Format } from '../../api'
import { fmtDate, showValue } from '../../format'
import { ACTION_LABEL, adm, type Diff, type FullPost, type Rev } from '../api'
import { StatusActions } from '../sheet'
import { useAction } from '../state'
import { Badge, Confirm, Empty, Fail, Hash, NoteField, Table, When } from '../ui'

/* A diff line's sign as a class name. '-' and '+' cannot be one, and built by
   interpolation the name is one the stylesheet can never match -- so the
   mapping is written out and the CSS names it. */
const SIGN: Record<string, string> = { '-': 'dl-out', '+': 'dl-in', '@': 'dl-at' }

/** One line of a diff: what a field was, and what it is now.

    The three of them -- the changed columns, the tags and the languages --
    drew the same four spans, and the only difference is how each turns its
    value into a string. A tag list joins on a comma; a column is whatever was
    in it; both answer an em dash when there is nothing. `admin.css` names
    these four classes and this is the one place that writes them. */
function Changed({ name, before, after }: { name: string; before: string; after: string }) {
  return (
    <div className="dfield">
      <span className="dname">{name}</span>
      <span className="dwas">{before}</span>
      <span className="dsep">→</span>
      <span className="dnow">{after}</span>
    </div>
  )
}

/** One entry, as only an operator can see it.

    This is the page that justifies `hidden=True` existing: a hidden entry has
    no page on the wiki, so if it cannot be read here it cannot be judged at
    all. Which is also why the body is shown as source rather than rendered —
    an operator deciding about vandalism wants the markdown a stranger typed,
    not the paragraph it turns into. */
export default function Entry() {
  const { id = '' } = useParams()
  const [post, setPost] = useState<FullPost | null>(null)
  const [revs, setRevs] = useState<Rev[] | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, run] = useAction(setErr)
  /* Which revision the diff is against. 'live' is the entry as it stands, and
     it is the default because "what did the last person change" is the question
     this page gets asked ninety per cent of the time. */
  const [pick, setPick] = useState<string | null>(null)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [reverting, setReverting] = useState<Rev | null>(null)
  /* The number, while it is being corrected. Its own state and not the post's:
     the field starts as what is stored and is a proposal until it is sent --
     the server settles the spelling, the format and the separators, the same
     way it does for the wiki's own writes. */
  const [renaming, setRenaming] = useState(false)
  const [num, setNum] = useState('')
  const [numFmt, setNumFmt] = useState<'' | Format>('')

  const load = useCallback(() => {
    setErr('')
    adm.post(id).then(setPost, (e) => setErr(errorText(e)))
    adm.revisions(id).then(setRevs, () => setRevs([]))
  }, [id])

  useEffect(load, [load])

  useEffect(() => {
    if (!pick) return setDiff(null)
    setDiff(null)
    adm.diff(id, pick, 'live').then(setDiff, (e) => setErr(errorText(e)))
  }, [id, pick])

  function renumber() {
    run(async () => {
      await adm.renumber(id, num, numFmt, note)
      setRenaming(false)
      setNote('')
      /* Refetched rather than patched in: the number decides the format, the
         sort key and the separators, and only the server knows what it settled
         them to. Renumbering also adds a revision, so the history is a row
         longer than the one on screen. */
      load()
      setPick(null)
    })
  }

  function revert() {
    if (!reverting) return
    run(async () => {
      await adm.revert(id, reverting.id, note)
      setReverting(null)
      setNote('')
      /* Reverting adds a revision rather than replacing one, so the history
         list is a row longer than it was and has to be refetched -- not just
         the entry. */
      load()
      setPick(null)
    })
  }

  if (err && !post)
    return (
      <div className="page">
        <Fail msg={err} onRetry={load} />
        <Link to="/content">← All content</Link>
      </div>
    )
  if (!post) return <div className="page"><Empty>Loading…</Empty></div>

  const flagged = post.reports.filter((r) => r.status === 'OPEN').length
  const waiting = post.requests.filter((r) => r.status === 'PENDING').length

  return (
    <div className="page">
      <Link className="back" to="/content">
        ← All content
      </Link>
      <div className="entry-head">
        <span className="num big">{showValue(post.value, post.grouped)}</span>
        <div>
          <h1>{post.title}</h1>
          <div className="entry-tags">
            <Badge>{post.status}</Badge>
            {!!flagged && <Badge>FLAGGED</Badge>}
            <span className="hash">{post.format}</span>
            {post.tags.map((t) => (
              <span className="badge" key={t}>
                {tagLabel(t)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Fail msg={err} />

      <div className="bar">
        <StatusActions post={post} onError={setErr} onDone={load} />
        <button
          className="btn"
          onClick={() => {
            setErr('')
            setNum(showValue(post.value, post.grouped))
            setNumFmt(post.format)
            setRenaming(true)
          }}
        >
          Change the number
        </button>
        {/* Plain anchors, and they have to be: the wiki is a different
            document. Everything else about an entry is edited on the wiki's own
            form rather than in a second editor here. The number is the one
            exception, and it is above: that field is read-only there on purpose,
            so this panel is the only place it can be corrected at all. */}
        <a className="btn push" href={`/p/${post.id}/edit`} target="_blank" rel="noreferrer">
          Edit on the wiki ↗
        </a>
        {post.status === 'ACTIVE' ? (
          <a className="btn" href={`/p/${post.id}`} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        ) : (
          <span className="hash self">Off the wiki, so it has no page there.</span>
        )}
      </div>

      {/* The history below is the entry's *revisions*; this is everything the
          log holds about it -- the reports, the requests, the comments, the
          moderation and the crashes, in one order. The two answer different
          questions and the second had no way in until the log took a filter. */}
      <p className="crumbs">
        <Link to={`/changes?post=${post.id}&kind=all`}>
          Everything logged about this entry →
        </Link>
      </p>

      <div className="cols">
        <div>
          <section className="stat-group">
            <h2>Body, as written</h2>
            {/* Source, not rendered markdown. An operator judging vandalism
                wants the characters a stranger typed -- a link's real href, a
                zero-width space, the twelve blank lines. */}
            {post.body ? (
              <pre className="src">{post.body}</pre>
            ) : (
              <Empty>No details on this one.</Empty>
            )}
          </section>

          {!!post.translations?.length && (
            <section className="stat-group">
              <h2>Languages</h2>
              {post.translations.map((t) => (
                <div className="src-box" key={t.id}>
                  <b>
                    {t.lang} · {t.title}
                  </b>
                  <pre className="src">{t.body || '—'}</pre>
                  <span className="hash">
                    {t.author}
                    {t.edited_by && ` · last ${t.edited_by}`}
                  </span>
                </div>
              ))}
            </section>
          )}

          <section className="stat-group">
            <h2>
              History{' '}
              <span className="hash">
                {post.revision_count} version{post.revision_count === 1 ? '' : 's'} kept
              </span>
            </h2>
            {revs?.length ? (
              <Table cols={['#', 'What', 'Who', 'From', 'When', 'Title then', '']}>
                {revs.map((r) => (
                  <tr key={r.id} className={pick === String(r.id) ? 'lit' : ''}>
                    <td className="tight num">{r.number}</td>
                    <td className="tight">
                      {ACTION_LABEL[r.action] ?? r.action.toLowerCase().replace(/_/g, ' ')}
                    </td>
                    <td className="tight">
                      {r.by ? <b>{r.by}</b> : r.author}
                    </td>
                    <td className="tight">
                      {r.admin_id ? <Badge>ADMIN</Badge> : (
                        <Hash
                          value={r.ip_hash}
                          to={r.ip_hash ? `/changes?ip=${r.ip_hash}&kind=all` : undefined}
                        />
                      )}
                    </td>
                    <td className="tight">
                      <When at={r.at} />
                    </td>
                    <td className="wide">
                      <span title={r.title ?? ''}>{r.title}</span>
                    </td>
                    <td className="acts">
                      <button
                        className={`btn small ${pick === String(r.id) ? 'on' : ''}`}
                        onClick={() => setPick(pick === String(r.id) ? null : String(r.id))}
                      >
                        Diff
                      </button>
                      <button className="btn small danger" onClick={() => setReverting(r)}>
                        Revert
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Never edited — as first written.</Empty>
            )}
          </section>

          {pick && (
            <section className="stat-group">
              <h2>
                What changed since version{' '}
                {revs?.find((r) => String(r.id) === pick)?.number}
              </h2>
              {!diff ? (
                <Empty>Working it out…</Empty>
              ) : !diff.fields.length && !diff.body.length
                && diff.tags.before.join() === diff.tags.after.join() ? (
                <Empty>Nothing at all. The entry is exactly that version.</Empty>
              ) : (
                <div className="diff">
                  {diff.fields.map((f) => (
                    <Changed
                      key={f.name}
                      name={f.name}
                      before={String(f.before ?? '—')}
                      after={String(f.after ?? '—')}
                    />
                  ))}
                  {diff.tags.before.join() !== diff.tags.after.join() && (
                    <Changed
                      name="tags"
                      before={diff.tags.before.join(', ') || '—'}
                      after={diff.tags.after.join(', ') || '—'}
                    />
                  )}
                  {diff.translations.before.join() !== diff.translations.after.join() && (
                    <Changed
                      name="languages"
                      before={diff.translations.before.join(', ') || '—'}
                      after={diff.translations.after.join(', ') || '—'}
                    />
                  )}
                  {!!diff.body.length && (
                    <pre className="dbody">
                      {diff.body.map((l, i) => (
                        <span className={`dl ${SIGN[l.sign] ?? ''}`} key={i}>
                          {l.sign}
                          {l.text}
                          {'\n'}
                        </span>
                      ))}
                    </pre>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <aside>
          <section className="stat-group">
            <h2>Facts</h2>
            <dl className="facts">
              <dt>Written by</dt>
              <dd>{post.author}</dd>
              <dt>Last editor</dt>
              <dd>{post.edited_by ?? '—'}</dd>
              <dt>Written</dt>
              <dd title={post.created_at}>{fmtDate(post.created_at)}</dd>
              <dt>Touched</dt>
              <dd title={post.updated_at}>{fmtDate(post.updated_at)}</dd>
              <dt>Likes</dt>
              <dd className="num">{post.likes}</dd>
              <dt>Written in</dt>
              <dd>{post.lang ?? 'not recorded'}</dd>
              <dt>Picture</dt>
              <dd>
                {post.image ? (
                  <a href={post.image} target="_blank" rel="noreferrer">
                    yes ↗
                  </a>
                ) : (
                  'none'
                )}
              </dd>
            </dl>
          </section>

          <section className="stat-group">
            <h2>
              Reports{' '}
              {!!flagged && <span className="badge warn">{flagged} open</span>}
            </h2>
            {post.reports.length ? (
              post.reports.map((r) => (
                <div className="note" key={r.id}>
                  <b>{r.reason}</b> <Badge>{r.status}</Badge>
                  {r.detail && <p>{r.detail}</p>}
                  <span className="hash">
                    <Hash
                      value={r.ip_hash}
                      to={r.ip_hash ? `/changes?ip=${r.ip_hash}&kind=all` : undefined}
                    /> · {fmtDate(r.created_at)}
                  </span>
                  {r.decision_note && <p className="hash">Closed: {r.decision_note}</p>}
                </div>
              ))
            ) : (
              <Empty>None.</Empty>
            )}
          </section>

          <section className="stat-group">
            <h2>
              Delete requests{' '}
              {!!waiting && <span className="badge warn">{waiting} waiting</span>}
            </h2>
            {post.requests.length ? (
              post.requests.map((r) => (
                <div className="note" key={r.id}>
                  <b>{r.reason}</b> <Badge>{r.status}</Badge>
                  {r.detail && <p>{r.detail}</p>}
                  <span className="hash">
                    {r.requested_by ?? 'anonymous'} ·{' '}
                    <Hash
                      value={r.ip_hash}
                      to={r.ip_hash ? `/changes?ip=${r.ip_hash}&kind=all` : undefined}
                    /> · {fmtDate(r.created_at)}
                  </span>
                  {r.decision_note && <p className="hash">Decided: {r.decision_note}</p>}
                </div>
              ))
            ) : (
              <Empty>None.</Empty>
            )}
          </section>

          <section className="stat-group">
            <h2>Comments</h2>
            {post.comments.length ? (
              post.comments.map((c) => (
                <div className="note" key={c.id}>
                  <b>{c.author}</b>
                  <p>{c.body}</p>
                  <span className="hash">{fmtDate(c.created_at)}</span>
                </div>
              ))
            ) : (
              <Empty>Nothing said.</Empty>
            )}
          </section>
        </aside>
      </div>

      <Confirm
        open={renaming}
        title="Change the number?"
        verb="Change it"
        busy={busy}
        onCancel={() => {
          setRenaming(false)
          setNote('')
        }}
        onOk={renumber}
      >
        {/* Repeated inside the dialog, and it has to be: the page behind a
            modal is inert and unreadable, and a refusal here is the ordinary
            case rather than the exception -- the same number back again, a
            format the value cannot be, an abbreviation with no letters in it,
            a date with no such day in it.
            The typed value stays put so it can be corrected. */}
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <p>
          The entry moves: it leaves{' '}
          <b className="num">{showValue(post.value, post.grouped)}</b> and is
          filed under whatever you type here instead. Nothing else about it
          changes, and the version it is now is kept — this is undoable from the
          history below like any other edit.
        </p>
        <div className="field">
          <label htmlFor="rn-value">Number</label>
          <input
            id="rn-value"
            className="mono"
            maxLength={32}
            // same reason as the wiki's own number field
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={num}
            onChange={(e) => setNum(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="rn-format">Format</label>
          {/* Sent as it stands rather than re-guessed, because the guess is
              sometimes wrong on purpose: an entry filed as Mixed must not jump
              into the abbreviation index the first time somebody fixes a typo
              in it. Auto-detect is here for the case where the new number is
              honestly a different kind. */}
          <select
            id="rn-format"
            value={numFmt}
            onChange={(e) => setNumFmt(e.target.value as '' | Format)}
          >
            <option value="">Work it out</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <NoteField
          label="Why (kept in the log)"
          value={note}
          onChange={setNote}
          placeholder="Optional, and read by the next operator"
        />
      </Confirm>

      <Confirm
        open={!!reverting}
        title={`Put version ${reverting?.number} back?`}
        verb="Revert to it"
        danger
        busy={busy}
        onCancel={() => {
          setReverting(null)
          setNote('')
        }}
        onOk={revert}
      >
        <p>
          The entry becomes “{reverting?.title}” as it was{' '}
          {reverting && fmtDate(reverting.at)}. The version being replaced is
          kept — reverting adds to the history rather than rewriting it, so this
          is undoable the same way anything else here is.
        </p>
        <NoteField
          label="Why (kept in the log)"
          value={note}
          onChange={setNote}
          placeholder="Optional"
        />
      </Confirm>
    </div>
  )
}
