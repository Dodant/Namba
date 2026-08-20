import { useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { Link, useParams } from 'react-router-dom'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import {
  api, fmtDate, nickname, numberPath, numSize, originalLabel, plain, showValue,
  tagLabel, tagPath, type Revision,
} from '../api'
import { Like } from '../components/PostCard'
import { useAsync } from '../useAsync'

/* A table in an entry is written by a stranger and can be any width, so it
   scrolls inside its own box rather than scrolling the page. The box has to
   wrap the table -- a <table> cannot be its own scroll port without giving up
   being a table box, which is what this used to do in CSS and what costs a
   screen reader its rows and columns. Only the markdown knows when there is a
   table at all, so the wrapper is handed to it here. */
const MD: Components = {
  table: ({ node: _node, ...rest }) => (   // node is react-markdown's, not the DOM's
    <div className="tbl">
      <table {...rest} />
    </div>
  ),
}

/* A read route reads. Every write this page used to carry inline -- adding a
   language, rewriting one, unlinking a related entry, restoring a revision,
   deleting the entry -- now lives at /p/:id/edit, and what is left here is one
   Edit pill, at the foot of the article. The exception is the recovery view
   below: when the entry is gone there is no edit form to reach, so Restore
   stays. */
export default function PostPage() {
  const { id = '' } = useParams()
  const loaded = useAsync(() => api.post(id), [id])
  const revs = useAsync(() => api.revisions(id), [id])
  const [err, setErr] = useState('')
  const [lang, setLang] = useState('')                       // '' is the entry itself
  const [credits, setCredits] = useState(false)              // closed on mount, not persisted

  const post = loaded.data

  /* The entry is gone, but its snapshots are not -- revisions have no foreign
     key precisely so a delete stays undoable. Show them here, or the wiki keeps
     a recovery it never offers. */
  async function resurrect(rev: Revision) {
    try {
      await api.restore(Number(id), rev.id, nickname.get() || 'anonymous')
      location.reload() // this render came off a 404; start clean
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (loaded.err)
    return (
      <>
        <p className="empty" role="alert">
          Couldn’t open this entry — {loaded.err}. <Link to="/">Back to the index.</Link>
        </p>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        {revs.data?.length ? (
          <>
            <h4 className="section">What it used to say</h4>
            <p className="quiet">
              Nothing here is lost. Restoring puts the entry back at this same
              address, so whatever linked to it still points at it.
            </p>
            <ol className="revs">
              {revs.data.map((r) => (
                <li className="rev" key={r.id}>
                  <b>{r.snapshot.title}</b>
                  <span>
                    {r.snapshot.value} · {byline(r)} · {fmtDate(r.at)}
                  </span>
                  <button className="btn small" onClick={() => resurrect(r)}>
                    Restore
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </>
    )
  if (!post)
    return (
      <p className="empty" role="status">
        Loading…
      </p>
    )

  // the tab in front. Both shapes carry title and body, which is all the page
  // reads off it -- the number, tags, image and links belong to the entry.
  const tr = post.translations?.find((t) => t.lang === lang) ?? null
  const shown = tr ?? post

  return (
    <div className="detail-layout">
      <article className="detail">
        {/* "Original", not "English": the wiki is English-first but a handful
            of entries came in written in another language, and a user is free
            to add "English" as a tab of its own. A reader's switch and nothing
            more -- adding a language is a write, and writes are at /edit.

            Absent until there is a second one, the same rule the header's
            language picker follows: one tab is a rule drawn across the top of
            the page to say the entry is written in the language you are
            already reading. It returns with the first translation. */}
        {!!post.translations?.length && (
          <nav className="tabs langs" aria-label="Language">
            <button
              className={lang ? '' : 'on'}
              aria-current={lang ? undefined : 'true'}
              onClick={() => setLang('')}
            >
              {originalLabel(post.lang)}
            </button>
            {post.translations.map((t) => (
              <button
                key={t.id}
                className={t.lang === lang ? 'on' : ''}
                aria-current={t.lang === lang ? 'true' : undefined}
                onClick={() => setLang(t.lang)}
              >
                {t.lang}
              </button>
            ))}
          </nav>
        )}

        <div className="hero">
          <Link
            className={`num ${numSize(showValue(post.value, post.grouped))}`}
            to={numberPath(post.value)}
          >
            {showValue(post.value, post.grouped)}
          </Link>
          <h1>{shown.title}</h1>
        </div>

        <div className="meta post-meta">
          {post.tags.map((t) => (
            <Link key={t} className="tag" to={tagPath(t)}>
              {tagLabel(t)}
            </Link>
          ))}
          <span className="post-like">
            <Like post={post} />
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="credits-btn"
            aria-expanded={credits}
            onClick={() => setCredits((v) => !v)}
          >
            {credits ? 'Hide credits' : 'Credits & history'}
          </button>
        </div>

        {/* who wrote it, who changed it, and who wrote the tab in front. All
            of it used to sit in the meta row and under the actions, where it
            was the first thing on the page and the last thing anyone read */}
        {credits && (
          <div className="credits">
            <span>
              Written by {post.author} · {fmtDate(post.created_at)}
            </span>
            {post.edited_by && (
              <span>
                Last edited by {post.edited_by} · {fmtDate(post.updated_at)}
              </span>
            )}
            <span>
              {tr
                ? `${tr.lang} added by ${tr.author}${tr.edited_by ? `, last edited by ${tr.edited_by}` : ''} · ${fmtDate(tr.updated_at)}`
                : post.lang
                  ? `Written in ${post.lang}, as first entered`
                  : 'As first entered'}
            </span>
            <span className="last">
              Anyone can edit — every version is kept, so nothing is lost.
            </span>
          </div>
        )}

        {post.image && <img className="full" src={post.image} alt={post.title} />}

        {/* No rehype-raw, deliberately: react-markdown renders to React
            elements and escapes raw HTML unless you hand it a plugin that
            does not. On a wiki anyone can post to, that default is the
            security model -- adding rehype-raw would need a sanitiser and a
            reason. remark-breaks because this is typed into a textarea, where
            pressing Enter visibly makes a line and ought to keep making one. */}
        {shown.body ? (
          <div className="body">
            <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MD}>
              {shown.body}
            </Markdown>
          </div>
        ) : (
          /* most entries arrive as a title and a number, so this is the common
             page, not the edge case -- without it the article ends at the meta
             row and reads as a page that failed to load. Worded about this
             version, so a translated tab with no text says the same thing. */
          <div className="body body-none">
            <p>
              No details on this one yet.{' '}
              <Link to={`/p/${post.id}/edit`}>Say what it means.</Link>
            </p>
          </div>
        )}

        {/* nothing at all when nothing is linked. A heading over the words
            "Nothing linked yet." is two lines spent saying the page has no
            more to show, which the end of the page already said. Linking is
            done in the edit form, so this is not a control anyone is missing */}
        {!!post.related?.length && (
          <>
            <h4 className="section">Related entries</h4>
            {post.related.map((r) => (
              <div className="rel" key={r.id}>
                <Link className="rel-num" to={numberPath(r.value)}>
                  {showValue(r.value, r.grouped)}
                </Link>
                <div className="rel-main">
                  <Link className="rel-t" to={`/p/${r.id}`}>
                    {r.title}
                  </Link>
                  {r.body && <div className="rel-b">{plain(r.body)}</div>}
                </div>
              </div>
            ))}
          </>
        )}

        {/* The one write on a read page, at the end of the read. In the meta
            row it was a pill beside the tags, offered before the entry had
            been read and competing with the number for the top of the page;
            here it is what you reach after the body and whatever is linked
            under it, which is when a reader knows whether it needs changing. */}
        <div className="actions">
          <Link className="btn primary" to={`/p/${post.id}/edit`}>
            Edit
          </Link>
        </div>
      </article>

      <aside className="side">
        <h4 className="section">Edit history</h4>
        <ol className="revs">
          <li className="rev now">
            <b>{post.title}</b>
            <span>
              current · {post.edited_by ? `edited by ${post.edited_by}` : `by ${post.author}`}
            </span>
          </li>
          {revs.data?.map((r) => (
            <li className="rev" key={r.id}>
              <b>{r.snapshot.title}</b>
              <span>
                {byline(r)} · {fmtDate(r.at)}
              </span>
            </li>
          ))}
        </ol>
        {!revs.loading && !revs.data?.length && (
          <p className="quiet">No edits yet — as first written.</p>
        )}
      </aside>
    </div>
  )
}

/* A delete snapshots under the author "deleted", which reads badly inside a
   sentence that already says "replaced by". If the backend ever words it
   differently this just falls back to the normal phrasing. */
const byline = (r: Revision) =>
  r.author === 'deleted' ? 'deleted' : `replaced by ${r.author}`
