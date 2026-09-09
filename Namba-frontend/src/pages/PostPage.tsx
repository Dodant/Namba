import { useEffect, useId, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { Link, useParams } from 'react-router-dom'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import {
  api, entryPath, errorText, nickname, tagLabel, tagPath, type Comment, type Revision,
} from '../api'
import { fmtCount, fmtDate, numSize, plain, showValue } from '../format'
import FlagPanel from '../components/FlagPanel'
import { Like } from '../components/PostCard'
import { useAsync } from '../useAsync'
import { revisionBy, useUi } from '../uiLocale'

/* A table in an entry is written by a stranger and can be any width, so it
   scrolls inside its own box rather than scrolling the page. The box has to
   wrap the table -- set to scroll in CSS, a <table> gives up being a table box
   and costs a screen reader its rows and columns. Only the markdown knows
   when there is a
   table at all, so the wrapper is handed to it here. */
const MD: Components = {
  table: ({ node: _node, ...rest }) => (   // node is react-markdown's, not the DOM's
    <div className="tbl">
      <table {...rest} />
    </div>
  ),
}

/* A read route reads. Every write to the entry -- adding a language, rewriting
   one, unlinking a related entry, restoring a revision -- lives at
   /p/:id/edit, and what is left here is one Edit link, at the end of the meta
   row.

   Three exceptions, all of them writes *beside* the entry rather than to it:
   the like, the comment box, and the flag panel. And the recovery view below,
   which is a write to the entry -- but when the entry is gone there is no edit
   form to reach, so Restore stays. */
export default function PostPage({ contentLang }: { contentLang: string }) {
  const { locale, m } = useUi()
  const { id = '' } = useParams()
  const loaded = useAsync(() => api.post(id), [id])
  const revs = useAsync(() => api.revisions(id), [id])
  const [err, setErr] = useState('')
  const [lang, setLang] = useState(contentLang)              // '' is the entry itself
  const [credits, setCredits] = useState(false)              // closed on mount, not persisted

  const post = loaded.data

  useEffect(() => setLang(contentLang), [contentLang, id])

  /* The entry is gone, but its snapshots are not -- revisions have no foreign
     key precisely so a delete stays undoable. Show them here, or the wiki keeps
     a recovery it never offers. */
  async function resurrect(rev: Revision) {
    try {
      await api.restore(Number(id), rev.id, nickname.get() || 'anonymous')
      location.reload() // this render came off a 404; start clean
    } catch (e) {
      setErr(errorText(e))
    }
  }

  if (loaded.err)
    return (
      <>
        <p className="empty" role="alert">
          {m.post.openFailed(loaded.err)} <Link to="/">{m.common.backToIndex}</Link>
        </p>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        {revs.data?.length ? (
          <>
            <h2 className="section">{m.post.usedToSay}</h2>
            <p className="quiet">
              {m.post.restoreHelp}
            </p>
            <ol className="revs">
              {revs.data.map((r) => (
                <li className="rev" key={r.id}>
                  <b>{r.title}</b>
                  <span>
                    {showValue(r.value, r.grouped, locale)} · {revisionBy(r.author, m)} · {fmtDate(r.at, locale)}
                  </span>
                  <button className="btn small" onClick={() => resurrect(r)}>
                    {m.common.restore}
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
        {m.common.loading}
      </p>
    )

  // the tab in front. Both shapes carry title and body, which is all the page
  // reads off it -- the number, tags, image and links belong to the entry.
  const tr = post.translations?.find((t) => t.lang === lang) ?? null
  const shown = tr ?? post
  const shownLang = tr?.lang ?? ''

  return (
    <div className="detail-layout">
      <article className="detail">
        {/* "Original", not "English": the wiki is English-first but a handful
            of entries came in written in another language, and a user is free
            to add "English" as a tab of its own. A reader's switch and nothing
            more -- adding a language is a write, and writes are at /edit.

            Absent until there is a translation: one tab is a rule across the top of
            the page to say the entry is written in the language you are
            already reading. It returns with the first translation. */}
        {!!post.translations?.length && (
          <nav className="tabs langs" aria-label={m.post.language}>
            <button
              className={shownLang ? '' : 'on'}
              aria-current={shownLang ? undefined : 'true'}
              onClick={() => setLang('')}
            >
              {m.post.original(post.lang)}
            </button>
            {post.translations.map((t) => (
              <button
                key={t.id}
                className={t.lang === shownLang ? 'on' : ''}
                aria-current={t.lang === shownLang ? 'true' : undefined}
                onClick={() => setLang(t.lang)}
              >
                {t.lang}
              </button>
            ))}
          </nav>
        )}

        <div className="hero">
          <Link
            className={`num ${numSize(showValue(post.value, post.grouped, locale))}`}
            to={entryPath(post.value, post.format)}
          >
            {showValue(post.value, post.grouped, locale)}
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
          {/* the row's two controls, at the far end and drawn as one pair:
              what the page can tell you about itself, and the one thing you
              can do to the entry. Edit is quiet here on purpose -- a pill at
              the top of a page offers to change an entry nobody has read yet.
              The slash separates and says nothing, so it is aria-hidden. */}
          <button
            type="button"
            className="meta-btn"
            aria-expanded={credits}
            onClick={() => setCredits((v) => !v)}
          >
            {credits ? m.post.hideCredits : m.post.showCredits}
          </button>
          <span className="meta-sep" aria-hidden="true">/</span>
          <Link className="meta-btn" to={`/p/${post.id}/edit`}>
            {m.post.edit}
          </Link>
        </div>

        {/* who wrote it, who changed it, and who wrote the tab in front --
            folded: in the meta row it is the first thing on the page and the
            last thing anyone reads */}
        {credits && (
          <div className="credits">
            <span>
              {m.post.writtenBy(post.author, fmtDate(post.created_at, locale))}
            </span>
            {post.edited_by && (
              <span>
                {m.post.lastEditedBy(post.edited_by, fmtDate(post.updated_at, locale))}
              </span>
            )}
            <span>
              {tr
                ? m.post.translationCredit(
                    tr.lang, tr.author, tr.edited_by, fmtDate(tr.updated_at, locale),
                  )
                : m.post.originalCredit(post.lang)}
            </span>
            <span className="last">
              {m.post.editPromise}
            </span>
          </div>
        )}

        {/* not lazy: this one is the entry's own picture, near the top of the
            page it is on, and is very often what the largest paint is. Only
            decoding=async, which takes it off the main thread without delaying
            the request. */}
        {post.image && (
          <img className="full" src={post.image} alt={post.title} decoding="async" />
        )}

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
              {m.post.noDetails}{' '}
              <Link to={`/p/${post.id}/edit`}>{m.post.sayMeaning}</Link>
            </p>
          </div>
        )}

        {/* nothing at all when nothing is linked. A heading over the words
            "Nothing linked yet." is two lines spent saying the page has no
            more to show, which the end of the page already said. Linking is
            done in the edit form, so this is not a control anyone is missing */}
        {!!post.related?.length && (
          <>
            <h2 className="section">{m.post.related}</h2>
            {post.related.map((r) => (
              <div className="rel" key={r.id}>
                <Link className="rel-num" to={entryPath(r.value, r.format)}>
                  {showValue(r.value, r.grouped, locale)}
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
      </article>

      <aside className="side">
        {/* Both sections in the rail fold and neither remembers, but they do
            not arrive the same way: comments are the page continuing and open
            on arrival, the edit history is a record you go looking for and
            starts shut. Its summary carries the count, so shut still answers
            the question most readers have of it. A <summary> rather than a
            button and a piece of state, the same as the index's bands; the
            heading stays a heading inside it, which is what keeps it in the
            outline and announced as one. */}
        <details>
          <summary className="ix-fold">
            <h2 className="section">{m.post.editHistory}</h2>{' '}
            {/* Only when there is something to count, and only once it has
                arrived: "0 edits" before the fetch lands is an answer rather
                than a wait, and the line under the list already says an entry
                has none. It counts the rows below it, which REVISIONS_SHOWN
                caps at 50 -- a total would have to come off the API.

                The figure alone here, unlike the index's bands: the heading a
                rail count sits beside is the noun already, and "Edit history
                3 edits" says edit twice in four words. */}
            {!!revs.data?.length && <span className="n">{fmtCount(revs.data.length, locale)}</span>}
          </summary>
          <ol className="revs">
            <li className="rev now">
              <b>{post.title}</b>
              <span>
                {m.post.current} · {post.edited_by ? m.post.editedBy(post.edited_by) : m.common.by(post.author)}
              </span>
            </li>
            {revs.data?.map((r) => (
              <li className="rev" key={r.id}>
                <b>{r.title}</b>
                <span>
                  {revisionBy(r.author, m)} · {fmtDate(r.at, locale)}
                </span>
              </li>
            ))}
          </ol>
          {!revs.loading && !revs.data?.length && (
            <p className="quiet">{m.post.noEdits}</p>
          )}
        </details>
        <Comments id={id} />
        {/* Last in the rail, and the least-used thing in it: how the entry got
            here, then what people make of it, then the one thing to do if it
            should not be here at all. It is also where the edit form's Delete
            button went -- deleting stopped being a stranger's click and became
            a request, and a request needs somewhere to be typed. */}
        <FlagPanel id={id} />
      </aside>
    </div>
  )
}

/* Five, then a fold. The browser owns the collapse -- the same <details> the
   index uses for a number that has collected more entries than a screen -- so
   there is no open state to hold anywhere on this page. */
const COMMENTS_SHOWN = 5

/** Talk beside the entry, under the history of how the entry got here.

    It is a write on a read page, which the like already established the
    carve-out for: it writes something beside the entry rather than the entry,
    so it does not belong at /edit with the five controls that change it.

    Nothing here rewrites or removes a comment. With no accounts a Remove button
    belongs to nobody, and unlike an entry a comment has no revision behind it,
    so the button would be the loss rather than the guard against it. */
function Comments({ id }: { id: string }) {
  const { locale, m } = useUi()
  const uid = useId()
  const fid = (name: string) => `${uid}-${name}`
  const [said, setSaid] = useState<Comment[] | null>(null)   // null is "loading"
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState(nickname.get())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSaid(null)
    api.comments(id).then(setSaid, (e) => setErr(errorText(e)))
  }, [id])

  /* The POST answers with the list, so what came back is the state: no refetch,
     no bump dep. The nickname is remembered the way every other form on the
     wiki remembers it -- it is the one thing a reader should not retype. */
  async function say() {
    if (!body.trim() || busy) return
    setBusy(true)
    setErr('')
    nickname.set(author)
    try {
      setSaid(await api.comment(id, { author: author.trim() || 'anonymous', body }))
      setBody('')
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const rest = said?.slice(COMMENTS_SHOWN) ?? []

  return (
    <details open>
      <summary className="ix-fold">
        <h2 className="section">{m.post.comments}</h2>{' '}
        {/* the figure alone -- "Comments 8 comments" was the word twice in a
            row. A band on the index says "12 entries" because its heading is
            "Under 100" and the noun is news there; here the heading is the
            noun, and what is left to say is how many. */}
        {!!said?.length && <span className="n">{fmtCount(said.length, locale)}</span>}
      </summary>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
      {!said ? (
        !err && (
          <p className="quiet" role="status">
            {m.common.loading}
          </p>
        )
      ) : said.length ? (
        <>
          {said.slice(0, COMMENTS_SHOWN).map((c) => cmt(c, locale))}
          {!!rest.length && (
            <details>
              <summary className="ix-fold">{m.post.more(rest.length)}</summary>
              {rest.map((c) => cmt(c, locale))}
            </details>
          )}
        </>
      ) : (
        <p className="quiet">{m.post.noComments}</p>
      )}
      {/* Reading stays first. The composer is a deliberate next step rather
          than the largest thing on a short entry, and native details retains
          keyboard semantics without adding open state to this component. */}
      <details className="cmt-compose">
        <summary className="ix-fold">{m.post.saySomething}</summary>
        <div className="cmt-form">
          <div className="field">
            <label htmlFor={fid('nick')}>{m.post.nickname}</label>
            <input
              id={fid('nick')}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={m.common.anonymous}
              maxLength={40}
            />
          </div>
          <div className="field">
            <label htmlFor={fid('say')}>
              {m.post.saySomething}{' '}
              {/* 300 is COMMENT_MAX in main.py, hand-copied the way every other
                  field cap is -- past it the API answers 422 rather than trimming */}
              <span className="hint">{m.post.commentLimit}</span>
            </label>
            <textarea
              id={fid('say')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={m.post.commentPlaceholder}
              maxLength={300}
            />
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !body.trim()}
            onClick={say}
          >
            {busy ? m.post.posting : m.post.postComment}
          </button>
        </div>
      </details>
    </details>
  )
}

/* Plain text, not markdown: a remark is a remark, and the entry below the
   number is where the formatting belongs. React escapes it, so there is nothing
   to sanitise either. */
const cmt = (c: Comment, locale = 'en') => (
  <div className="cmt" key={c.id}>
    <p>{c.body}</p>
    <span>
      {c.author} · {fmtDate(c.created_at, locale)}
    </span>
  </div>
)
