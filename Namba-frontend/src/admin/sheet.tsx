import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { errorText, REASON_LABEL, tagLabel } from '../api'
import { fmtDate, showValue } from '../format'
import { adm, type FullPost, type PostStatus } from './api'
import { useAction } from './state'
import { Badge, Confirm, Drawer, Empty, Fail, Hash, NoteField, When } from './ui'

/** The entry behind a row, and the three buttons that move it.

    Its own module rather than more of `ui.tsx` because these two know what an
    entry is and everything in there is deliberately a shape -- a table, a
    badge, a hash. Components only, so the file keeps fast refresh.

    Both of these existed once already, spelled out on `Entry.tsx`, and the
    reason they moved is that the queues need them: an operator deciding about
    a report was reading the reasons and never the entry, because the entry was
    a page away and the page cost them their place in the queue. */

/* What each move does, what it says while asking, and what survives it. The
   last part is the one that matters: on this wiki hiding an entry keeps its
   history, its comments and its translations, and an operator who does not
   know that will not press the button. */
const MOVES: Record<string, {
  to: PostStatus; label: string; ask: string; verb: string; danger?: boolean; says: string
}> = {
  hide: {
    to: 'HIDDEN', label: 'Take off the wiki', verb: 'Hide it', danger: true,
    ask: 'Hide this entry?',
    says: 'It leaves the index, the lists, its own page and both vocabularies. '
      + 'Its history, its comments and its translations are untouched, and '
      + 'putting it back is this same button.',
  },
  remove: {
    to: 'DELETED', label: 'Mark removed', verb: 'Remove it', danger: true,
    ask: 'Mark this entry removed?',
    says: 'The same as hiding, and it reads differently in the list: removed '
      + 'means somebody asked and you agreed. Nothing is deleted — no route in '
      + 'this wiki deletes a row.',
  },
  show: {
    to: 'ACTIVE', label: 'Put back on the wiki', verb: 'Put it back',
    ask: 'Put this entry back?',
    says: 'It returns whole, at the same address, with everything that was '
      + 'attached to it.',
  },
}

/** Hide, mark removed, or put back — wherever the entry is being looked at.

    Reversible, all three of them, and by the same button: `posts.status` is
    the whole mechanism and this route is its own undo. That is the reason
    these are ordinary destructive buttons with one confirmation rather than a
    typed-name ritual — the irreversible removal on this wiki is `admin.py
    purge`, which is in a shell and not in here. */
export function StatusActions(
  { post, small, onDone, onError }: {
    post: FullPost
    small?: boolean
    onDone: () => void
    onError: (message: string) => void
  },
) {
  const [ask, setAsk] = useState<keyof typeof MOVES | null>(null)
  const [note, setNote] = useState('')
  const [busy, run] = useAction(onError)
  const size = small ? 'btn small' : 'btn'

  function move() {
    if (!ask) return
    run(async () => {
      await adm.setStatus(post.id, MOVES[ask].to, note)
      setAsk(null)
      setNote('')
      onDone()
    })
  }

  return (
    <>
      {post.status === 'ACTIVE' ? (
        <>
          <button className={`${size} danger`} onClick={() => setAsk('hide')}>
            {MOVES.hide.label}
          </button>
          <button className={`${size} danger`} onClick={() => setAsk('remove')}>
            {MOVES.remove.label}
          </button>
        </>
      ) : (
        <button className={`${size} primary`} onClick={() => setAsk('show')}>
          {MOVES.show.label}
        </button>
      )}

      <Confirm
        open={!!ask}
        title={ask ? MOVES[ask].ask : ''}
        verb={ask ? MOVES[ask].verb : ''}
        danger={ask ? MOVES[ask].danger : false}
        busy={busy}
        onCancel={() => {
          setAsk(null)
          setNote('')
        }}
        onOk={move}
      >
        <p className="quoted">
          <span className="num">{showValue(post.value, post.grouped)}</span>{' '}
          {post.title}
        </p>
        <p>{ask && MOVES[ask].says}</p>
        <NoteField
          label="Why (kept in the log)"
          value={note}
          onChange={setNote}
          placeholder="Optional, and read by the next operator"
        />
      </Confirm>
    </>
  )
}

/** What somebody said about an entry: a report, or a request to take it down.

    Both tables carry the same columns, and an operator reads them the same
    way -- the reason first, then the words, then who and from where. The hash
    is a link because that is the question it exists to answer: the same one
    across four entries is a campaign rather than four readers agreeing. */
function Said(
  { reason, detail, who, ip, at, status, closed }: {
    reason: string
    detail: string
    who?: string | null
    ip: string | null
    at: string
    status: string
    closed: string | null
  },
) {
  return (
    <div className="note">
      <b>{reason}</b> <Badge>{status}</Badge>
      {REASON_LABEL[reason] && <div className="hash">{REASON_LABEL[reason]}</div>}
      {detail ? <p>{detail}</p> : <p className="hash">No detail given.</p>}
      <span className="hash">
        {who ? `${who} · ` : ''}
        <Hash value={ip} to={ip ? `/changes?ip=${ip}&kind=all` : undefined} /> ·{' '}
        <When at={at} />
      </span>
      {closed && <p className="hash">Closed: {closed}</p>}
    </div>
  )
}

/** One entry, read without leaving the list it was found in.

    Everything an operator needs to judge a report is here -- what the entry
    actually says, who wrote it, what else has been said about it, and what it
    has been through -- and so are the buttons that act on it. What is *not*
    here is the diff, which wants the width, so the page is a click away and
    stays the linkable thing you can send to somebody.

    One request answers all of it: `/api/admin/posts/{id}` already carried the
    body, the reports, the requests and the comments, which is why this cost no
    new route. */
export function EntrySheet(
  { postId, at, onStep, onClose, onChanged, children }: {
    postId: number | null
    /** "3 of 24", when this is standing in a queue. */
    at?: string
    onStep?: (by: 1 | -1) => void
    onClose: () => void
    /** The list underneath has gone stale — a status moved, a queue closed. */
    onChanged?: () => void
    /** The queue's own decision, in the sticky footer beside the status moves.
        Reports resolve, requests approve; neither belongs to the entry. */
    children?: ReactNode
  },
) {
  const [post, setPost] = useState<FullPost | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    if (postId == null) return
    setErr('')
    adm.post(postId).then(setPost, (e) => setErr(errorText(e)))
  }, [postId])

  useEffect(() => {
    /* cleared on the way in, or the sheet shows the last entry's body under
       the new entry's heading for as long as the request takes */
    setPost(null)
    load()
  }, [load])

  const open = postId != null
  const flagged = post?.reports.filter((r) => r.status === 'OPEN').length ?? 0
  const waiting = post?.requests.filter((r) => r.status === 'PENDING').length ?? 0

  return (
    <Drawer
      open={open}
      at={at}
      onStep={onStep}
      onClose={onClose}
      title={
        post ? (
          <>
            <span className="num">{showValue(post.value, post.grouped)}</span>{' '}
            {post.title}
          </>
        ) : (
          `Entry ${postId ?? ''}`
        )
      }
    >
      <Fail msg={err} onRetry={load} />
      {!post ? (
        !err && <Empty>Loading…</Empty>
      ) : (
        <>
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

          {/* Source, not rendered markdown, for the same reason the entry page
              shows source: an operator judging vandalism wants the characters
              a stranger typed — a link's real href, a zero-width space, the
              twelve blank lines — not the paragraph they render into. */}
          <h3>Body, as written</h3>
          {post.body ? (
            <pre className="src short">{post.body}</pre>
          ) : (
            <Empty>No details on this one.</Empty>
          )}

          <h3>Facts</h3>
          <dl className="facts">
            <dt>Written by</dt>
            <dd>{post.author}</dd>
            <dt>Last editor</dt>
            <dd>{post.edited_by ?? '—'}</dd>
            <dt>Written</dt>
            <dd title={post.created_at}>{fmtDate(post.created_at)}</dd>
            <dt>Touched</dt>
            <dd title={post.updated_at}>{fmtDate(post.updated_at)}</dd>
            <dt>Versions</dt>
            <dd className="num">{post.revision_count}</dd>
            <dt>Likes</dt>
            <dd className="num">{post.likes}</dd>
          </dl>

          {!!post.reports.length && (
            <>
              <h3>
                Reports{' '}
                {!!flagged && <span className="badge warn">{flagged} open</span>}
              </h3>
              {post.reports.map((r) => (
                <Said
                  key={r.id} reason={r.reason} detail={r.detail} ip={r.ip_hash}
                  at={r.created_at} status={r.status} closed={r.decision_note}
                />
              ))}
            </>
          )}

          {!!post.requests.length && (
            <>
              <h3>
                Delete requests{' '}
                {!!waiting && <span className="badge warn">{waiting} waiting</span>}
              </h3>
              {post.requests.map((r) => (
                <Said
                  key={r.id} reason={r.reason} detail={r.detail} ip={r.ip_hash}
                  who={r.requested_by ?? 'anonymous'} at={r.created_at}
                  status={r.status} closed={r.decision_note}
                />
              ))}
            </>
          )}

          {!!post.comments.length && (
            <>
              <h3>Comments</h3>
              {post.comments.map((c) => (
                <div className="note" key={c.id}>
                  <b>{c.author}</b>
                  <p>{c.body}</p>
                  <span className="hash">{fmtDate(c.created_at)}</span>
                </div>
              ))}
            </>
          )}

          <h3>Elsewhere</h3>
          <p className="sheet-links">
            <Link to={`/content/${post.id}`}>Full entry, with the diff →</Link>
            <Link to={`/changes?post=${post.id}&kind=all`}>
              Everything logged about it →
            </Link>
            <a href={`/p/${post.id}/edit`} target="_blank" rel="noreferrer">
              Edit on the wiki ↗
            </a>
          </p>

          {/* Sticky, so the decisions do not scroll out of reach behind a
              dozen reports — which is exactly when they matter most. */}
          <div className="sheet-acts">
            {children}
            <StatusActions
              post={post}
              onError={setErr}
              onDone={() => {
                load()
                onChanged?.()
              }}
            />
          </div>
        </>
      )}
    </Drawer>
  )
}
