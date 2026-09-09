/** How a stored value reads on screen, and how a typed one comes back: a
    number's punctuation, a numeral's size class, a date's distance from now, a
    markdown body read as prose, and which runs of text *are* a given number.

    Two rules hold the whole file. A value never becomes a JavaScript `Number`
    -- `canonicalNumber` says why -- and nothing in here imports anything.
    `format.test.ts` covers every function. */

/* String arithmetic, not Number or parseFloat: an entry may be 20 digits long,
   past the point where JavaScript can round-trip every integer. Intl is asked
   only which punctuation a locale uses; the entry itself never becomes a
   floating-point value. */
const LOCALIZABLE = /^(\d+)(?:\.(\d+))?$/
type NumberPunctuation = { group: string; decimal: string; groupChars: string[] }
const NUMBER_PUNCTUATION = new Map<string, NumberPunctuation>()
const INTEGER_FORMATTERS = new Map<string, Intl.NumberFormat>()

export function fmtCount(value: number, locale = 'en') {
  let formatter = INTEGER_FORMATTERS.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
    INTEGER_FORMATTERS.set(locale, formatter)
  }
  return formatter.format(value)
}

function numberPunctuation(locale: string): NumberPunctuation {
  const cached = NUMBER_PUNCTUATION.get(locale)
  if (cached) return cached
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  const group = parts.find((p) => p.type === 'group')?.value ?? ','
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  /* French keyboards and pasted prose use three visually similar spaces for
     grouping. Accept all three, but always display Intl's narrow no-break one. */
  const groupChars = locale.toLowerCase().startsWith('fr')
    ? [...new Set([group, ' ', '\u00a0', '\u202f'])]
    : [group]
  const punctuation = { group, decimal, groupChars }
  NUMBER_PUNCTUATION.set(locale, punctuation)
  return punctuation
}

/** Turn a value typed in one interface locale into the one spelling stored by
    the API. An invalid grouping pattern is content, not a typo we may erase:
    1,2,3 and Apollo,11 therefore come back untouched. */
export function canonicalNumber(value: string, locale = 'en') {
  const raw = value.trim()
  const { decimal, groupChars } = numberPunctuation(locale)
  const decimalParts = raw.split(decimal)
  if (decimalParts.length > 2) return { value: raw, grouped: false }
  const [integer, fraction] = decimalParts
  if (!integer || (fraction !== undefined && !/^\d+$/.test(fraction))) {
    return { value: raw, grouped: false }
  }
  const groups = [integer]
  for (const char of groupChars) {
    for (let i = groups.length - 1; i >= 0; i -= 1) {
      groups.splice(i, 1, ...groups[i].split(char))
    }
  }
  const grouped = groups.length > 1
  const validInteger = grouped
    ? /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((part) => /^\d{3}$/.test(part))
    : /^\d+$/.test(integer)
  if (!validInteger) return { value: raw, grouped: false }
  return {
    value: groups.join('') + (fraction === undefined ? '' : `.${fraction}`),
    grouped,
  }
}

/** Keep an explicitly numeric field honest while still accepting the
    punctuation printed by its interface locale. Auto-detect and Mixed are not
    filtered; they must remain able to hold dates, ratios and other notation. */
export function cleanNumberInput(value: string, locale: string, decimal: boolean) {
  const punctuation = numberPunctuation(locale)
  const allowed = new Set([
    ...'0123456789',
    ...punctuation.groupChars,
    ...(decimal ? [punctuation.decimal] : []),
  ])
  return [...value].filter((char) => allowed.has(char)).join('')
}

export const canGroupValue = (value: string) => {
  const match = LOCALIZABLE.exec(value)
  return Boolean(match && match[1].length >= 4)
}

/** The value as it should read on screen. Never use it to build a link --
    entryPath() takes the raw value, and /n/1,000 is a different page. */
export function showValue(value: string, grouped?: boolean, locale = 'en') {
  const match = LOCALIZABLE.exec(value)
  if (!match) return value
  const punctuation = numberPunctuation(locale)
  const integer = grouped && match[1].length >= 4
    ? match[1].replace(/\B(?=(\d{3})+(?!\d))/g, punctuation.group)
    : match[1]
  return integer + (match[2] === undefined ? '' : punctuation.decimal + match[2])
}

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
export function marker(
  { value, format }: { value: string; format: string },
  locale: string,
) {
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

/** Which size class a numeral wears, from how much room the value needs. A
    value is a string a stranger typed -- "7" and "1960년 4월 16일 오후 3시" are
    both valid -- so one font size either shouts at the first or breaks the
    layout on the second, and a viewport clamp cannot tell them apart. Every
    numeral on the wiki reads it: the index rows, the feed, both heroes and the
    cards. Pass what is on screen, not the raw value: grouping adds commas.
    The sizes themselves are in index.css, per surface. */
export const numSize = (shown: string) =>
  shown.length > 7 ? 'long' : shown.length > 4 ? 'mid' : ''

/* How long ago, not which day: "4 minutes ago", "2 days ago", "5 months ago".
   Every date on this wiki is a byline in a list, an edit in a history or a
   remark under an entry, and all three are read to answer how fresh the thing
   is -- "Aug 20, 2026" made the reader do that subtraction on every row.

   Intl.RelativeTimeFormat rather than a table of plurals: it is the platform's
   own, it knows "1 day" from "2 days", and it is the same Intl the absolute
   form was already asking for. numeric: 'always' so the scale stays one voice
   -- 'auto' answers -1 day with "yesterday" and -1 month with "last month",
   which is a different register from "3 weeks ago" above it.

   A month is 30 days here, which is what every relative clock does and is
   invisible at this resolution: nothing turns on whether a five-week-old edit
   reads as 5 weeks or 1 month. The year is twelve of those months rather than
   365 days, so that the five days between them cannot come out as "12 months
   ago" -- the months stop at 11 and hand over. */
const RTF = new Map<string, Intl.RelativeTimeFormat>()
const MONTH = 30 * 86400
const SPANS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 12 * MONTH], ['month', MONTH], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
]
const JUST_NOW: Record<string, string> = {
  ko: '방금 전', ja: 'たった今', 'zh-Hans': '刚刚', es: 'ahora mismo', fr: 'à l’instant', de: 'gerade eben',
}

export function fmtDate(s: string, locale = 'en') {
  const d = new Date(s)
  if (isNaN(+d)) return s   // whatever the API said, unchanged -- as before
  const secs = (Date.now() - +d) / 1000
  let formatter = RTF.get(locale)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
    RTF.set(locale, formatter)
  }
  for (const [unit, per] of SPANS) {
    if (secs >= per) return formatter.format(-Math.floor(secs / per), unit)
  }
  /* under the minute, and also anything stamped by a clock ahead of this one:
     a comment posted "in 6 seconds" is a skew, not news. */
  return JUST_NOW[locale] ?? 'just now'
}

/** Markdown source read back as prose, for the one-line previews in lists.
    Deliberately not a parser: a preview only has to stop "**bold**" and "## "
    showing up as punctuation, and the entry page renders the real thing a
    click away. Underscores are only stripped when they wrap a word, so
    snake_case survives. Collapsing whitespace matters as much as the marks:
    a body with blank lines otherwise sprawls down a feed row. */
export const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')
    .replace(/[*`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
