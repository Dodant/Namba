import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, numSize, showValue, tagLabel } from '../api'
import PostCard from '../components/PostCard'
import { useAsync } from '../useAsync'
import { useUi } from '../uiLocale'

type Mode = 'number' | 'abbr' | 'tag' | 'search'

/** One list of posts, four ways in: a number, an abbreviation, a tag, or a
    search. The first two are one page about one value and differ only in which
    section they read; the last two differ only in which filter found the rows. */
export default function Browse({ mode, lang }: { mode: Mode; lang: string }) {
  const { m } = useUi()
  const { value: raw = '', tag = '' } = useParams()
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''

  const abbr = mode === 'abbr'
  /* the value is stored upper-case, and /a/ufo is a link somebody typed or
     pasted from before that was true -- fold it here rather than asking the
     API to match loosely, so the page and its canonical say the one spelling */
  const value = abbr ? raw.toUpperCase() : raw
  /* one value, two sections: a page about a number never shows an entry filed
     as an abbreviation, and the other way round. See section_where() in main.py */
  const section = abbr ? 'abbr' : 'number'

  const posts = useAsync(
    () =>
      api.posts(
        mode === 'number' || abbr
          ? { value, section, sort: 'number', lang }
          : mode === 'tag'
            ? { tag, sort: 'number', lang }
            : { q, sort: 'number', lang },
      ),
    [mode, value, section, tag, q, lang],
  )

  const n = posts.data?.length ?? 0
  const count = m.common.entries(n)
  const shownValue = showValue(value, !!posts.data?.length && posts.data.every((p) => p.grouped))
  /* what /new needs to put the reader back in the section they came from --
     without it, "UFO" typed into a form with Auto-detect is right by luck */
  const addHref = `/new?value=${encodeURIComponent(value)}${abbr ? '&format=ABBR' : ''}`

  return (
    <>
      {mode === 'number' || abbr ? (
        <div className="hero">
          {/* same rule as the index row: this page is one number shared by
              several entries, so separators need all of them to agree */}
          {/* numSize off what is drawn, not off `value`: the separators are
              two of the characters the hero has to find room for */}
          {/* the <h1>, because it is what this page is about. It was a div
              under a heading that read "Three people have written about this
              number" -- a sentence that names its subject only by pointing at
              something beside it, which is exactly what a crawler, an answer
              engine and a screen reader's heading list cannot follow.
              .hero .num beats .hero h1 on specificity, so it draws unchanged. */}
          <h1 className={`num ${numSize(shownValue)}`}>{shownValue}</h1>
          {/* stays even when empty: it is the flex spacer that holds the
              middle. At zero there is nothing to describe and no format to
              read it from, so the empty state below says the rest */}
          <div className="hero-said">
            {posts.data?.length ? (
              <>
                <span className="kicker">{m.format[posts.data[0].format]}</span>
                {/* a <p> now that the numeral above is the heading. The words
                    are unchanged: "this number" was only vague while nothing
                    on the page was marked up as being the number. */}
                <p>
                  {m.browse.summary(n, abbr)}
                </p>
              </>
            ) : null}
          </div>
          {/* "another" needs a first one. With none, this said Add another
              meaning above an empty page that already said Give it a meaning
              -- the same invitation twice, and the wrong word on the louder
              of the two. The empty state keeps it; the pill comes back with
              the entry it is offering to sit beside. */}
          {n > 0 && (
            <Link className="btn outline" to={addHref}>
              {m.browse.addMeaning}
            </Link>
          )}
        </div>
      ) : (
        <div className="hero">
          <div className="hero-said">
            {/* the count waits for the answer: before it arrives the list is
                empty and "0 entries" is a result, not a wait */}
            <span className="kicker">
              {mode === 'tag' ? m.browse.category : m.browse.search}
              {posts.data ? ` · ${count}` : ''}
            </span>
            <h1>{mode === 'tag' ? tagLabel(tag) : `“${q}”`}</h1>
          </div>
        </div>
      )}

      {posts.err && (
        <p className="err" role="alert">
          {posts.err}
        </p>
      )}
      {posts.loading && (
        <p className="empty" role="status">
          {m.common.loading}
        </p>
      )}

      {posts.data?.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          showNumber={mode !== 'number' && !abbr}
          except={mode === 'tag' ? tagLabel(tag) : undefined}
        />
      ))}

      {!posts.loading && n === 0 && (
        // an empty search is not an empty wiki, and saying "no entries yet" on
        // all three reads as though the place were deserted
        <p className="empty">
          {mode === 'number' || abbr ? (
            <>
              {m.browse.emptyValue(value)}{' '}
              <Link to={addHref}>{m.browse.giveMeaning}</Link>
            </>
          ) : mode === 'tag' ? (
            <>
              {m.browse.emptyTag(tagLabel(tag))} <Link to="/new">{m.common.addFirst}</Link>
            </>
          ) : (
            <>
              {m.browse.noMatches(q)}{' '}
              <Link to="/new">{m.browse.addNewEntry}</Link>
            </>
          )}
        </p>
      )}
    </>
  )
}
