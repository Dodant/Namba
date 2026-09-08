import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ABBR_BUCKETS, api, BUCKETS, entryPath, fmtCount, fmtDate, FORMATS,
  isAbbr, numSize, plain, showValue, tagLabel, tagPath,
  type Format, type NumberEntry, type Post,
} from '../api'
import { Like } from '../components/PostCard'
import { useAsync } from '../useAsync'
import { useUi } from '../uiLocale'

/* one path instead of an icon package -- it inherits currentColor and the
   row's font size, so it stays as quiet as the text beside it */
const Photo = ({ label }: { label: string }) => (
  <svg className="ix-img" viewBox="0 0 16 16" role="img" aria-label={label}>
    <rect x="1.4" y="3" width="13.2" height="10" rx="1.6" fill="none"
          stroke="currentColor" strokeWidth="1.3" />
    <circle cx="5.4" cy="6.6" r="1.2" fill="currentColor" />
    <path d="M2.2 12.2 6 8.6l2.4 2.3 2.2-2.1 3.2 3.1" fill="none"
          stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
)

/* what a number looks like when it is spelled out. The short entries are Greek
   and Latin roots, which is why they only ever match at the start of a word:
   "hepta" in Heptapod is a seven, "bi" in Bible is not a two -- and the
   two-letter roots are left out entirely because that is a fight they lose.
   ponytail: a cardinal can still light up inside a bigger number word, so the
   lookahead below fends off the pairs that actually collide (six/sixteen). */
const WORDS: Record<number, string[]> = {
  1: ['one', 'first', 'single', 'mono'],
  2: ['two', 'second', 'twice', 'double', 'duo'],
  3: ['three', 'third', 'tri'],
  4: ['four', 'quad', 'tetra'],
  5: ['five', 'fifth', 'penta', 'quint'],
  6: ['six', 'hexa'],
  7: ['seven', 'hepta', 'sept'],
  8: ['eighth', 'eight', 'oct'],
  9: ['nine', 'ninth', 'nona', 'ennea'],
  10: ['ten', 'deca'],
  11: ['eleven', 'hendeca'],
  12: ['twelve', 'twelfth', 'dozen', 'dodeca'],
  13: ['thirteen'],
  14: ['fourteen'],
  15: ['fifteen'],
  16: ['sixteen'],
  17: ['seventeen'],
  18: ['eighteen'],
  19: ['nineteen'],
  20: ['twenty', 'icosa'],
  30: ['thirty'],
  40: ['forty'],
  50: ['fifty'],
  60: ['sixty', 'sexa'],
  70: ['seventy'],
  80: ['eighty'],
  90: ['ninety'],
  100: ['hundred', 'cent', 'hecto'],
  200: ['bicentennial'],
  1000: ['thousand', 'kilo', 'millenni'],
  10000: ['myriad'],
  1000000: ['million', 'mega'],
}

/* Escaped, because "3.14" and "11/22/63" are regex if you let them be, and
   bounded, because a value lights up where it is the whole number and nowhere
   else: the 2 in "The Two Popes (2019)" is the first digit of a year, and
   "Catch-22" is not two of this entry's twos. \b is what says so -- it falls
   between a word character and anything else, so it finds no seam inside a run
   of digits, and none is exactly what should match there.

   Conditional, because \b needs a word character on our side of it to be a
   boundary at all: a value ending in punctuation would be asking for a seam
   that cannot exist and would never match anything again. */
const whole = (s: string) =>
  (/^\w/.test(s) ? '\\b' : '') +
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
  (/\w$/.test(s) ? '\\b' : '')

/* the number as written and the number as spelled, in one pass. Only INTEGER
   rows get words, since a TIME sort_key of 100 is 01:40, not a hundred.
   The optional "th" swallows the regular ordinals -- sixth, tenth, hundredth --
   so they light up whole; the irregular ones are spelled out in WORDS, and the
   longest form goes first so "eighth" wins over "eight". */
function marker({ value, format }: NumberEntry, locale: string) {
  const words = format === 'INTEGER' ? (WORDS[Number(value)] ?? []) : []
  const grouped = showValue(value, true, locale)
  const alts = [
    whole(value),
    ...(grouped === value ? [] : [whole(grouped)]),
    ...[...words]
      .sort((a, b) => b.length - a.length)
      .map((w) => `\\b${w}(?:th)?(?!teen|ty)`),
  ]
  return new RegExp(`(${alts.join('|')})`, 'gi')
}

/* split on a single capture group: odd slots are the matches, and they keep the
   text's own casing, so "Hepta" stays "Hepta" */
function mark(text: string, rx: RegExp) {
  return text
    .split(rx)
    .map((part, i) =>
      i % 2 ? (
        <b className="hit" key={i}>
          {part}
        </b>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    )
}

/* Two ways to read the same wiki: down the numbers, or along the dates. They
   share nothing but the header, so they are two components rather than one
   with a branch in the middle of its hooks. */
export default function Home({ lang }: { lang: string }) {
  const [params] = useSearchParams()
  return params.get('view') === 'feed' ? <Feed lang={lang} /> : <Index lang={lang} />
}

function Feed({ lang }: { lang: string }) {
  const { locale, m } = useUi()
  /* sort=recent is updated_at DESC, so an entry someone rewrote this morning
     comes back to the top. Sorted by the API, not here: a client-side sort
     over a bounded page is only right until the twenty-first entry. */
  const posts = useAsync(() => api.posts({ sort: 'recent', limit: 20, lang }), [lang], true)

  return (
    <>
      <p className="feed-intro">
        {m.home.feedIntro}
      </p>

      {posts.err && (
        <p className="err" role="alert">
          {posts.err}
        </p>
      )}
      {posts.loading && !posts.data && (
        <p className="empty" role="status">
          {m.common.loading}
        </p>
      )}

      {posts.data?.map((p: Post) => (
        <article className="fx" key={p.id}>
          <Link
            className={`fx-num ${numSize(showValue(p.value, p.grouped, locale))}`}
            to={entryPath(p.value, p.format)}
          >
            {showValue(p.value, p.grouped, locale)}
          </Link>
          <h2>
            <Link to={`/p/${p.id}`}>{p.title}</Link>
          </h2>
          <div className="fx-body">
            {p.body && <p>{plain(p.body)}</p>}
            <div className="meta">
              {p.tags.map((t) => (
                <Link key={t} className="tag" to={tagPath(t)}>
                  {tagLabel(t)}
                </Link>
              ))}
              <span>
                {m.common.by(p.author)} · {fmtDate(p.created_at, locale)}
              </span>
              {p.updated_at !== p.created_at && (
                <span>
                  · {m.common.edited(fmtDate(p.updated_at, locale), p.edited_by)}
                </span>
              )}
              <span className="likes">♥ {fmtCount(p.likes, locale)}</span>
            </div>
          </div>
        </article>
      ))}

      {!posts.loading && !posts.data?.length && (
        <p className="empty">
          {m.home.empty} <Link to="/new">{m.common.addFirst}</Link>
        </p>
      )}
    </>
  )
}

/* Past this many entries one number is a wall in the middle of an index you
   are reading down, so it gets a fold of its own. Ten because that is about a
   screen of rows on a phone: a number with nine meanings is a row you scroll
   past, not one you have to get around. */
const FOLD_OVER = 10

/* "8 numbers · 21 entries". The row count on its own says how far the band
   scrolls and nothing about how much is in it -- eight numbers is eight
   entries on a thin band and forty on a busy one, and the second figure is
   the one that moves as the wiki fills up. Both, because the band folds:
   closed, this line is all it says about itself. The first noun follows the
   format: the Abbreviation band counts abbreviations, not numbers. */
function bandCount(items: NumberEntry[], format: Format, m: ReturnType<typeof useUi>['m']) {
  const entries = items.reduce((n, item) => n + item.entries.length, 0)
  return m.home.bandCount(
    items.length,
    m.common.subject(isAbbr(format), items.length),
    entries,
  )
}

function Index({ lang }: { lang: string }) {
  const { locale, m } = useUi()
  const [params, setParams] = useSearchParams()
  const format = (params.get('format') ?? 'INTEGER') as Format
  const tag = params.get('tag') ?? ''

  /* The strip keeps whole words and scrolls, so the tab you are on can start
     off the end of it -- and a strip showing four tabs with no underline on
     any of them says the page belongs to none of them. Nothing in CSS can ask
     "which one is current"; this is the smallest thing that can.

     `inline: 'nearest'` moves it the least that will do, so a tab already on
     screen -- which is every tab you reach by tapping one -- does not slide.
     `block: 'nearest'` is what keeps it off the vertical scroll: without it
     this fights ScrollTop in App for where the page starts. A layout effect
     rather than an effect, or the first paint is at scrollLeft 0 and the
     strip visibly jumps. */
  const strip = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    strip.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [format])

  const tags = useAsync(() => api.tags(), [])
  const numbers = useAsync(() => api.numbers({ format, tag, lang }), [format, tag, lang], true)

  /* Which rows had to be cut. An index is read down the numerals, so a row is
     one line and what does not fit is clipped -- but whether a given line was
     clipped is a measurement, and CSS cannot ask it, so the class goes on from
     here and `.ix-more` is drawn off it.

     A window resize is the whole of it: nothing else changes a row's width --
     a band folding changes the height, and the like appearing is opacity. The
     second pass is for the fonts, which arrive after the first paint with
     `display=swap` and are wider than what they replace, so measuring once
     marks the wrong rows on a cold load. Queried off the document rather than
     a ref because this component is the only thing in the app that renders an
     `.ix-link`, and the fragment it returns has no element to hang one on. */
  useEffect(() => {
    const measure = () => {
      for (const el of document.querySelectorAll<HTMLElement>('.ix-link'))
        el.classList.toggle('cut', el.scrollWidth > el.clientWidth + 1)
    }
    measure()
    document.fonts.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [numbers.data])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  /* off the rows, not off the URL: while the next format loads, the rows on
     screen are still the last one's, and "Decimal" over a list of integers is
     a worse answer than a heading that lags a frame behind the tab. */
  const shownFormat = numbers.data?.[0]?.format ?? format
  const rows = numbers.data ?? []
  const bands =
    shownFormat === 'INTEGER'
      ? BUCKETS.map((b) => ({
          label: m.buckets[b],
          items: rows.filter((n) => n.bucket === b),
        }))
      : shownFormat === 'ABBR'
        ? ABBR_BUCKETS.map((b) => ({
            /* a letter is its own label in every locale; the two ranges
               space their dash the way the integer bands do */
            label: b.replace('-', ' – '),
            items: rows.filter((n) => n.bucket === b),
          }))
        : [{ label: m.format[shownFormat], items: rows }]

  return (
    <>
      <nav className="tabs fmts" ref={strip} aria-label={m.home.entryKinds}>
        {FORMATS.map((f) => (
          <Link
            key={f}
            /* .apart on the one that reads letters, not on the fifth: the
               gap before it is the digits/letters line and not a position
               in FORMATS, so reordering that array moves the tab and leaves
               the gap where it belongs. index.css spends the free space. */
            className={`${isAbbr(f) ? 'apart ' : ''}${f === format ? 'on' : ''}`}
            aria-current={f === format ? 'page' : undefined}
            to={`/?${new URLSearchParams({ format: f, ...(tag ? { tag } : {}) })}`}
          >
            {/* Whole words at every width. Five of them want 400px and a
                320px screen has 288, so the strip scrolls -- see .tabs.fmts
                in index.css, and the layout effect above, which is what keeps
                the tab you are on from starting off the end of it. This used
                to slice each label down to "Int" and "Abbr." to make them
                fit; scrolling is what replaced that, and a label here is now
                just its label. */}
            {m.format[f]}
          </Link>
        ))}
      </nav>

      {/* Wears .band so it folds and reads like the bands under it. Closed by
          default -- twenty chips is a wall in front of the thing people came
          for, and the summary carries the filter so a folded panel never
          hides which one is on. */}
      <details className="band chips-fold">
        <summary className="band-head">
          <h2>{m.home.categories}</h2>
          {/* outside the h2: heading type is uppercase here, and a tag that
              reads BOOK beside a chip reading book is the same word twice */}
          {tag && <span className="active">{tagLabel(tag)}</span>}
          <span className="rule" />
          <span className="n">
            {m.common.tags(tags.data?.length ?? 0)}
          </span>
        </summary>
        <div className="chips">
          <button
            className={`chip ${tag ? '' : 'on'}`}
            aria-pressed={!tag}
            onClick={() => setParam('tag', '')}
          >
            {m.home.all}
          </button>
          {(tags.data ?? []).map((t) => (
            <button
              key={t.tag}
              className={`chip ${t.tag === tag ? 'on' : ''}`}
              aria-pressed={t.tag === tag}
              onClick={() => setParam('tag', t.tag === tag ? '' : t.tag)}
            >
              {tagLabel(t.tag)}
              <span className="n">{fmtCount(t.count, locale)}</span>
            </button>
          ))}
        </div>
      </details>

      {numbers.err && (
        <p className="err" role="alert">
          {numbers.err}
        </p>
      )}
      {/* only the first load says so: a reload keeps the list it has, and a
          line that replaced it would be the collapse all over again */}
      {numbers.loading && !numbers.data && (
        <p className="empty" role="status">
          {m.common.loading}
        </p>
      )}

      {bands.map(
        (band) =>
          band.items.length > 0 && (
            /* <details>, not a button and a piece of state: the browser
               already knows how to open and close a disclosure, and it
               gets the keyboard and the screen reader right for free.
               Open by default -- the index is the page, and five closed
               headings is a table of contents, not a wiki. */
            <details className="band" key={band.label} open>
              <summary className="band-head">
                <h2>{band.label}</h2>
                <span className="rule" />
                <span className="n">{bandCount(band.items, shownFormat, m)}</span>
              </summary>
              <ol className="index">
                {band.items.map((n: NumberEntry) => {
                  const rx = marker(n, locale)
                  const shown = showValue(n.value, n.grouped, locale)
                  const rows = n.entries.map((e) => (
                    // the like sits outside the link: a button inside an
                    // anchor is invalid, and both want the same click
                    <div className="ix-e" key={e.id}>
                      <Link className="ix-link" to={`/p/${e.id}`}>
                        <span className="ix-t">{mark(e.title, rx)}</span>
                        {e.image && <Photo label={m.home.hasImage} />}
                        {e.body && (
                          <span className="ix-b"> — {mark(plain(e.body), rx)}</span>
                        )}
                      </Link>
                      {/* The way through when the line was cut. A second link
                          to where the first one goes, so it is aria-hidden and
                          out of the tab order: "see more" in a screen reader's
                          list of links names nothing, and the row above it
                          already does. index.css shows it only on a .ix-link
                          the effect marked, so a row that fits ends in its own
                          last word. */}
                      <Link
                        className="ix-more"
                        to={`/p/${e.id}`}
                        aria-hidden
                        tabIndex={-1}
                      >
                        {m.home.seeMore}
                      </Link>
                      <span className="ix-like">
                        <Like post={e} />
                      </span>
                    </div>
                  ))
                  return (
                  <li className="ix" key={`${n.format}-${n.value}`}>
                    <Link
                      className={`ix-num ${numSize(shown)}`}
                      to={entryPath(n.value, n.format)}
                    >
                      {shown}
                    </Link>
                    {/* <details> and not a piece of state, the same as the
                        band above it: the browser owns the collapse and gets
                        the keyboard and the screen reader right for free.

                        Open, so a fold never hides an entry from a reader who
                        did not ask -- it is there to be closed by someone who
                        wants past this number, and the summary says what
                        closing it costs. The numeral stays outside it: it is
                        a link to /n/:value, and a link inside a summary is one
                        click that has to be two things. */}
                    {n.entries.length > FOLD_OVER ? (
                      <details className="ix-titles" open>
                        <summary className="ix-fold">{m.home.foldedEntries(n.entries.length)}</summary>
                        {/* the rows need a box of their own in here. A
                            <details> puts everything after the summary into
                            one anonymous content box, so the column's gap
                            falls between the summary and that box rather than
                            between the rows inside it, and a folded number
                            drew its entries 4px tighter than every other row
                            on the page. */}
                        <div className="ix-list">{rows}</div>
                      </details>
                    ) : (
                      <div className="ix-titles">{rows}</div>
                    )}
                  </li>
                  )
                })}
              </ol>
            </details>
          ),
      )}

      {!numbers.loading && !numbers.data?.length && (
        <p className="empty">
          {m.notFound} <Link to="/new">{m.common.addFirst}</Link>
        </p>
      )}
    </>
  )
}
