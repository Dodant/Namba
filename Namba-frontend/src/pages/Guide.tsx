import { Fragment } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { langLabel } from '../api'
import { BASE_LANG, byCode, codeOf, GUIDES } from '../guide'
import { OUTLINE, type GuideDoc, type Section } from '../guide/outline'
import { useUi } from '../uiLocale'

/* The wiki's one page of rules, in two layers and in whatever language it has
   been written in.

   Everything above the first rule is what somebody about to type a value
   needs: one test, four rules, four things that are never entries, and what
   happens when an entry breaks one. Everything below it is the same questions
   asked one subject at a time, which is the half an operator points at rather
   than the half a poster reads. Every heading carries an id for exactly that,
   and the ids come from OUTLINE rather than from either language file, so
   /guide#mining and /guide?lang=ko#mining are the same rule.

   Why any of it is written down: every other guard here is a 422 or a column
   an operator sets, and none of them can hold this one. `3` is a valid value
   whether it is the Trinity or the third GTA, so no parser can tell an entry
   from a serial number.

   .body for the prose rhythm -- the same stylesheet /p/:id's markdown renders
   into -- and .guide adds the measure and the h1 on .form's own rules. .tbl is
   the scroll port a table needs at 320px.

   Deliberately NOT in index.css's :is() no-select list, unlike every other
   sentence the app says about itself. That rule keeps chrome out of a copy of
   an entry; there is no entry on this page to contaminate, and a page of rules
   is the one thing here somebody has a reason to quote at somebody else. */

/* remarkGfm without remarkBreaks, which is the one difference from the entry
   body's dialect and is deliberate. remark-breaks is there because a reader
   types into a textarea and expects Enter to break a line; these are files in
   the repository, where a blank line means what it means in every other
   markdown document and a wrapped source line is just a wrapped source line. */
const Prose = ({ children }: { children: string }) => (
  <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
)

/* Eight tables below the rule, always the same two columns, so the shape is
   written once. The heads are `columns` off the language file and are no
   longer spelled in here: that was fine while English was the only language
   and a bug the moment it was not -- eight Korean tables under "An entry /
   Not an entry" are eight tables half in the wrong language. Two words, and
   a translation cannot ship without its own pair.

   The wrapper is the scroll port rather than the <table>, for the reason
   index.css gives beside .tbl: a table that is not a table box can stop being
   announced as rows and columns. */
function Rows({ rows, heads }: {
  rows: NonNullable<Section['rows']>
  heads: GuideDoc['columns']
}) {
  return (
    <div className="tbl">
      <table>
        <thead>
          <tr>
            <th>{heads[0]}</th>
            <th>{heads[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([yes, no], i) => (
            <tr key={i}>
              <td><Prose>{yes}</Prose></td>
              <td><Prose>{no}</Prose></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* Absolute, and the only date in this app that is. fmtDate is "2 days ago"
   everywhere else because every other date here is a byline or an edit, read
   to answer how fresh a thing is. A rules version is read to answer *which*
   rules, and "changed 5 months ago" cannot answer that -- it needs a fixed
   point you can compare two documents at. en-GB so the month is a word: 09/01
   is two dates depending on the reader. */
const stamp = (iso: string, locale: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })

export default function Guide() {
  const { locale, m } = useUi()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { hash } = useLocation()
  /* The URL decides, not state and not the header's picker. A rule an operator
     is quoting has to travel: /guide?lang=ko#mining is a link that goes in a
     delete request and arrives at the same rule it left. The header's picker
     answers a different question anyway -- which language *lists* render in,
     off what readers have translated -- and the two vocabularies are not the
     same set. */
  const lang = byCode(params.get('lang')) ?? BASE_LANG
  const doc = GUIDES[lang]
  const base = GUIDES[BASE_LANG]
  const behind = lang !== BASE_LANG && doc.version !== base.version

  return (
    <article className="body guide">
      {/* The house shape for a page's head: a .kicker of metadata over an h1
          that is the subject and nothing else. */}
      <p className="guide-meta">
        <span>v{doc.version} · {stamp(doc.updated, locale)}</span>
        {Object.keys(GUIDES).length > 1 && (
          <span className="select">
              <select
                value={codeOf(lang)}
                aria-label={m.guide.readIn}
                onChange={(e) => {
                  /* replace, not push: the language is which copy of one page
                     you are reading, and Back through four of them is not a
                     history anybody wants.

                     navigate rather than setSearchParams, and the hash passed
                     back explicitly: a partial path defaults every field it
                     does not name, so setSearchParams drops the fragment.
                     Switching language while parked on a rule has to keep you
                     on that rule -- reading #mining in English and wanting it
                     in Korean is the whole reason the picker is here rather
                     than only in a link. */
                  const next = new URLSearchParams(params)
                  next.set('lang', e.target.value)
                  nav({ search: `?${next}`, hash }, { replace: true })
                }}
              >
                {Object.keys(GUIDES).map((l) => (
                  <option key={l} value={codeOf(l)}>
                    {langLabel(l)}
                  </option>
              ))}
            </select>
          </span>
        )}
      </p>
      <h1>{doc.title}</h1>

      {/* A translation left behind by a rule change is the failure this whole
          arrangement exists to make visible. It cannot be prevented -- the
          rules move in English first, and they should -- so it is said out
          loud instead, at the top, where somebody about to rely on it reads
          it. Not an .empty and not an error: it is a fact about the document,
          in the document's own voice. */}
      {behind && (
        <p className="fine" role="status">
          {doc.stale
            .replace('{mine}', doc.version)
            .replace('{base}', base.version)}{' '}
          <Link to={`?lang=${codeOf(BASE_LANG)}`}>{base.title} →</Link>
        </p>
      )}

      {/* a div and not a p: the lede is markdown and runs to three
          paragraphs in Korean, and a <p> cannot hold one. .guide .lede sets
          the size on the box and the paragraphs inherit it. */}
      <div className="lede"><Prose>{doc.lede}</Prose></div>

      {OUTLINE.map(([id, level], i) => {
        if (id === '--') return <hr key={i} />
        const s = doc.sections[id]
        const H = level === 3 ? 'h3' : 'h2'
        /* A fragment rather than a <section>: .body's rhythm is written for
           headings and paragraphs that are its own children, and wrapping each
           one in a box moves what :first-child and :last-child mean. */
        return (
          <Fragment key={id}>
            <H id={id}>{s.heading}</H>
            {s.body && <Prose>{s.body}</Prose>}
            {s.rows && <Rows rows={s.rows} heads={doc.columns} />}
            {s.note && <Prose>{s.note}</Prose>}
          </Fragment>
        )
      })}

      <p>
        <Link to="/new">{m.guide.addEntry}</Link>
      </p>
    </article>
  )
}
