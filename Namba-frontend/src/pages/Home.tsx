import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ABBR_BUCKETS, api, BUCKETS, entryPath, FORMATS, MONTH_BUCKETS, sectionOf,
  tagLabel, tagPath, type Format, type NumberEntry, type Post,
} from '../api'
import {
  fmtCount, fmtDate, marker, monthName, numSize, plain, plainLines, showDay,
  showValue, todayMonthDay,
} from '../format'
import { Like } from '../components/PostCard'
import { useAsync } from '../useAsync'
import { useUi, type Messages } from '../uiLocale'

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
  const [offset, setOffset] = useState(0)
  const [shown, setShown] = useState<Post[]>([])
  const [lastPageSize, setLastPageSize] = useState(0)
  /* sort=recent is updated_at DESC, so an entry someone rewrote this morning
     comes back to the top. Sorted by the API, not here: a client-side sort
     over a bounded page is only right until the twenty-first entry. */
  const posts = useAsync(
    () => api.posts({ sort: 'recent', limit: FEED_PAGE_SIZE, offset, lang }),
    [lang, offset],
  )

  /* A click on "More" must add to what the reader was already scanning, not
     swap twenty familiar cards for twenty new ones. The id check also makes a
     quick double click harmless if a recently edited item moves between the
     two requests. */
  useEffect(() => {
    const page = posts.data
    if (!page) return
    setLastPageSize(page.length)
    setShown((before) =>
      offset === 0
        ? page
        : [...before, ...page.filter((p) => !before.some((old) => old.id === p.id))],
    )
  }, [posts.data, offset])

  /* Translation preference changes the copy in every card, so the old
     language must not remain above the first page of the new one. */
  useEffect(() => {
    setOffset(0)
    setShown([])
    setLastPageSize(0)
  }, [lang])

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

      {shown.map((p: Post) => (
        <article className="fx" key={p.id}>
          <Link
            className={`fx-num ${numSize(showValue(p.value, p.grouped, locale, p.format))}`}
            to={entryPath(p.value, p.format)}
          >
            {showValue(p.value, p.grouped, locale, p.format)}
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

      {!posts.loading && !shown.length && (
        <p className="empty">
          {m.home.empty} <Link to="/new">{m.common.addFirst}</Link>
        </p>
      )}
      {!!shown.length && lastPageSize === FEED_PAGE_SIZE && (
        <div className="feed-more">
          <button
            type="button"
            className="btn outline"
            disabled={posts.loading}
            onClick={() => setOffset((n) => n + FEED_PAGE_SIZE)}
          >
            {posts.loading ? m.common.loading : m.home.moreRecent}
          </button>
        </div>
      )}
    </>
  )
}

const FEED_PAGE_SIZE = 20

/* Past this many entries one number is a wall in the middle of an index you
   are reading down, so it gets a fold of its own. Ten because that is about a
   screen of rows on a phone: a number with nine meanings is a row you scroll
   past, not one you have to get around. */
const FOLD_OVER = 10

/* Which rows had to be cut. An index is read down the numerals, so a row is
   one line and what does not fit is clipped -- but whether a given line was
   clipped is a measurement, and CSS cannot ask it, so the class goes on from
   here and `.ix-more` is drawn off it.

   Queried off the document rather than a ref, because `Index` is the only
   thing in the app that renders an `.ix-link` and the fragment it returns has
   no element to hang one on -- and at module scope rather than inside the
   effect that calls it, because it closes over nothing and the Births /
   Deaths fold has to be able to call it too.

   Three things move a row's width or reveal one: a window resize, the fonts
   arriving after the first paint with `display=swap` wider than what they
   replace, and the Births / Deaths fold opening. That third one is about a
   browser this app cannot ask about. A closed <details> hides its content with
   `content-visibility` where `::details-content` is implemented, which keeps
   the rows laid out and measurable while they are hidden, and with
   `display: none` where it is not -- and measured at `display: none` a row is
   0 wide, is never marked, and no later pass corrects it, because every other
   band in this index is open when it is first drawn and nothing else here ever
   reveals a row. So the fold measures again on open. One layout on a gesture
   the reader made, and the row is right either way. */
function measure() {
  const links = [...document.querySelectorAll<HTMLElement>('.ix-link')]
  /* Clear first, and that is the whole of this. `See more` costs the line
     about 60px, so measuring while it is on screen asks "does this fit in the
     space left after the button", which a cut row can only ever answer yes to
     -- the control makes the case for its own existence and no row ever gives
     it back: not a widened window, and not the fonts pass, since a row marked
     while the fallback font is showing stays marked once Newsreader arrives
     narrower. So every pass starts from a row with nothing at the end of it
     and asks the question that was meant: is anything hidden at all. */
  links.forEach((el) => el.classList.remove('cut'))
  // read all, then write all -- interleaving them is a layout per row
  const over = links.map((el) => el.scrollWidth > el.clientWidth + 1)
  links.forEach((el, i) => el.classList.toggle('cut', over[i]))
}

/* "8 numbers · 21 entries". The row count on its own says how far the band
   scrolls and nothing about how much is in it -- eight numbers is eight
   entries on a thin band and forty on a busy one, and the second figure is
   the one that moves as the wiki fills up. Both, because the band folds:
   closed, this line is all it says about itself. The first noun follows the
   section: the Abbreviation band counts abbreviations and the Calendar band
   counts dates, not numbers. */
/* One band of the index. `keep`, `now` and `sub` are the Calendar tab's alone:
   every other band is drawn only when it has rows, no other index has a band
   the date makes current, and no other index splits one. */
type Band = {
  label: string
  items: NumberEntry[]
  sub?: NumberEntry[]
  keep?: boolean
  now?: boolean
}

/* A month's two lists: what the day means, and who was born or died on it.
   The split is per *entry* and not per date, so December 25 keeps Christmas in
   the list above and Newton's birth in the fold below -- one date drawn in each
   place it has entries for, rather than a whole date going one way because of
   one of its entries. A row with nothing left on its side drops out. */
function sideOf(rows: NumberEntry[], want: boolean) {
  return rows
    .map((row) => ({ ...row, entries: row.entries.filter((e) => e.birth_death === want) }))
    .filter((row) => row.entries.length > 0)
}

function bandCount(items: NumberEntry[], sub: NumberEntry[] | undefined,
                   format: Format, m: Messages) {
  /* the whole month, folded entries included: closed, this line is all the
     band says about itself, so it must not count only half of it. Dates by
     `value` because a split one is in both lists and is still one date. */
  const all = sub ? [...items, ...sub] : items
  const subjects = sub ? new Set(all.map((row) => row.value)).size : all.length
  const entries = all.reduce((n, item) => n + item.entries.length, 0)
  return m.home.bandCount(
    subjects,
    m.common.subject(sectionOf(format), subjects),
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

  /* Which rows had to be cut -- see `measure` above. A window resize and the
     fonts arriving are the two passes it needs; the Births / Deaths fold adds
     a third of its own, on the element that opens it. */
  useEffect(() => {
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
  const bands: Band[] =
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
        : shownFormat === 'CALENDAR'
          ? MONTH_BUCKETS.map((b) => ({
              /* Intl knows the month names in all seven locales, so there is
                 no thirteenth row to keep in `m.buckets` -- and no 84 of them
                 once every locale answers */
              label: monthName(Number(b), locale),
              items: sideOf(rows.filter((n) => n.bucket === b), false),
              sub: sideOf(rows.filter((n) => n.bucket === b), true),
              /* the one index that draws a band with nothing in it:
                 twelve months are a calendar, and a year missing August reads
                 as a bug rather than as a month nobody has written about. */
              keep: true,
              /* the month it is, in blue. Every month is open, so what the
                 reader needs is not a month to open but where in twelve to
                 look. Read at render rather than held: a page left open
                 overnight is on the right month the next time it draws.
                 Local time, because the reader's calendar is the reader's. */
              now: b === todayMonthDay().slice(0, 2),
            }))
          : [{ label: m.format[shownFormat], items: rows }]

  return (
    <>
      <nav className="tabs fmts" ref={strip} aria-label={m.home.entryKinds}>
        {FORMATS.map((f, i) => (
          <Link
            key={f}
            /* .apart wherever the section changes, not on a position in
               FORMATS: the gaps are the /n/, /c/ and /a/ lines, so reordering
               that array moves the tabs and leaves the gaps where they
               belong. index.css draws each one as 12px and a hairline -- the
               strip scrolls rather than spreading, so there is no free space
               to spend -- and two of them make three groups read as three. */
            className={`${i > 0 && sectionOf(f) !== sectionOf(FORMATS[i - 1])
              ? 'apart ' : ''}${f === format ? 'on' : ''}`}
            aria-current={f === format ? 'page' : undefined}
            to={`/?${new URLSearchParams({ format: f, ...(tag ? { tag } : {}) })}`}
          >
            {/* Whole words at every width. Six of them want past 400px and a
                320px screen has 288, so the strip scrolls -- see .tabs.fmts
                in index.css, and the layout effect above, which is what keeps
                the tab you are on from starting off the end of it. A label
                here is its label: the strip scrolls rather than shortening
                them to "Int" and "Abbr." to fit. */}
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
          (band.items.length > 0 || band.keep) && (
            /* <details>, not a button and a piece of state: the browser
               already knows how to open and close a disclosure, and it
               gets the keyboard and the screen reader right for free.
               Open, every one of them, the Calendar's twelve months
               included -- the index is the page, and closed headings are a
               table of contents, not a wiki. */
            <details className="band" key={band.label} open>
              <summary className="band-head">
                <h2 className={band.now ? 'now' : undefined}>{band.label}</h2>
                <span className="rule" />
                <span className="n">
                  {bandCount(band.items, band.sub, shownFormat, m)}
                </span>
              </summary>
              <ol className="index">
                {band.items.map((row) => (
                  <IndexRow key={`${row.format}-${row.value}`} row={row} />
                ))}
              </ol>
              {/* Who was born and who died, at the foot of the month and
                  closed. The same disclosure a number past FOLD_OVER gets --
                  `.ix-fold`, one level in and one step quieter than the band
                  head above it -- because it is the same gesture at the same
                  scale. Closed is the point: a month is read for what its days
                  mean, and this is the list you go looking for.

                  onToggle is not decoration: these are the only rows in the
                  index that are hidden when they are first drawn, and whether
                  a hidden row can be measured is the browser's call. See
                  `measure` above. */}
              {band.sub && band.sub.length > 0 && (
                <details className="band-sub" onToggle={measure}>
                  <summary className="ix-fold">
                    <span>{m.home.birthsDeaths}</span>
                    {/* `common.entries` and not `home.foldedEntries`: that one
                        is a row's own fold, which only opens past FOLD_OVER and
                        so never has to say "1 entries". This one can hold a
                        single birth. */}
                    <span>{m.common.entries(
                      band.sub.reduce((n, row) => n + row.entries.length, 0),
                    )}</span>
                  </summary>
                  <ol className="index">
                    {band.sub.map((row) => (
                      <IndexRow key={`${row.format}-${row.value}`} row={row} />
                    ))}
                  </ol>
                </details>
              )}
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


/** One entry filed under a number: the line, the layer behind it, and the like.

    Its own component because a row is three things at once -- a line clipped
    to one line, a popover that lays the same entry out with the room a layer
    has, and the button that opens the second from the first -- and written
    inline it puts a hundred lines and three more levels of nesting between a
    band and the numerals it bands. */
function IndexEntry(
  { entry, shownValue, mark }:
  {
    entry: NumberEntry['entries'][number]
    /** the number as the row above it draws it: the layer leads with it, the
        way every hero in this app does, which is the shape a row cannot take */
    shownValue: string
    /** lights up this number in a title or a blurb, written and spelled */
    mark: (text: string) => ReactNode
  },
) {
  const { m } = useUi()
  return (
    // the like sits outside the link: a button inside an anchor is invalid,
    // and both want the same click
    <div className="ix-e">
      <Link className="ix-link" to={`/p/${entry.id}`}>
        {/* Inside the link and leading the line, which is where a date page
            puts a year: the row is one click and one ellipsis, and a year
            outside it would be a second flex item the clipping has to reason
            about. Plain digits -- a year is not grouped, so 1642 and not
            1,642, in any locale. */}
        {entry.year != null && <span className="yr">{entry.year}</span>}
        <span className="ix-t">{mark(entry.title)}</span>
        {entry.image && <Photo label={m.home.hasImage} />}
        {entry.body && <span className="ix-b"> — {mark(plain(entry.body))}</span>}
      </Link>
      {/* The way through when the line was cut, and it opens the line rather
          than going anywhere -- the title next to it is already the link to
          the entry, so a second one here was the same click twice.

          popovertarget and [popover], so the browser owns the layer: the top
          layer, light dismiss on a click outside, Escape, and one open at a
          time, none of it written here. Same argument as the <details> above.
          index.css shows the button only on a .ix-link the effect marked, so a
          row that fits carries no control at all -- not on screen and not in
          the a11y tree, since display: none takes it out of both. */}
      <button className="ix-more" popoverTarget={`ix-pop-${entry.id}`}>
        {m.home.seeMore}
      </button>
      {/* The row again, laid out with the room a layer has and the row does
          not: the number it is filed under over the title, and then the blurb
          as a paragraph rather than the tail of a sentence the title started.
          Which is the whole reason it is worth opening -- the line it replaces
          reads those three things as one run-on that did not fit. */}
      <div className="ix-pop" id={`ix-pop-${entry.id}`} popover="auto">
        <p className="ix-pop-num">{shownValue}</p>
        <p className="ix-pop-title">{mark(entry.title)}</p>
        {entry.body && <p className="ix-pop-body">{mark(plainLines(entry.body))}</p>}
      </div>
      <span className="ix-like">
        <Like post={entry} />
      </span>
    </div>
  )
}

/** One number, and every meaning filed under it. */
function IndexRow({ row }: { row: NumberEntry }) {
  const { locale, m } = useUi()
  const rx = marker(row, locale)
  const shownValue = showValue(row.value, row.grouped, locale, row.format)
  /* The month is the band heading over this row, so the column says the day
     and nothing else. "September 11" down every row of September is the
     heading repeated nine characters at a time, in the one column the index
     is read down -- and that column is 104px of tabular numerals on purpose.
     The popover below keeps the whole date: a layer has room a row does not,
     and out there the heading is behind it rather than above it. */
  const shownNum = row.format === 'CALENDAR' ? showDay(row.value) : shownValue
  /* and the day itself, the same blue as the month heading over it */
  const today = row.format === 'CALENDAR' && row.value === todayMonthDay()
  const entries = row.entries.map((entry) => (
    <IndexEntry
      key={entry.id}
      entry={entry}
      shownValue={shownValue}
      mark={(text) => mark(text, rx)}
    />
  ))

  return (
    <li className="ix">
      <Link
        className={`ix-num ${numSize(shownNum)}${today ? ' now' : ''}`}
        to={entryPath(row.value, row.format)}
        /* the colour is the whole of it on screen; this is the half of it a
           screen reader gets */
        aria-current={today ? 'date' : undefined}
        /* only where the column is showing a shortened form: a link whose
           whole accessible name is "11" has lost what the heading above it
           was carrying, and nothing reads a heading for a link it jumps to */
        aria-label={shownNum === shownValue ? undefined : shownValue}
      >
        {shownNum}
      </Link>
      {/* <details> and not a piece of state, the same as the band above it:
          the browser owns the collapse and gets the keyboard and the screen
          reader right for free.

          Open, so a fold never hides an entry from a reader who did not ask --
          it is there to be closed by someone who wants past this number, and
          the summary says what closing it costs. The numeral stays outside it:
          it is a link to /n/:value, and a link inside a summary is one click
          that has to be two things. */}
      {row.entries.length > FOLD_OVER ? (
        <details className="ix-titles" open>
          <summary className="ix-fold">{m.home.foldedEntries(row.entries.length)}</summary>
          {/* the rows need a box of their own in here. A <details> puts
              everything after the summary into one anonymous content box, so
              the column's gap falls between the summary and that box rather
              than between the rows inside it, and a folded number drew its
              entries 4px tighter than every other row on the page. */}
          <div className="ix-list">{entries}</div>
        </details>
      ) : (
        <div className="ix-titles">{entries}</div>
      )}
    </li>
  )
}
