/** What the comments in `format.ts` claim, as assertions.

    Not a test per branch: what is pinned is the set of rules those functions
    exist to keep -- an invalid grouping is content, a value never becomes a
    Number, punctuation follows the interface locale while identity does not,
    and a number lights up where it is the whole number and nowhere else. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canGroupValue, canonicalNumber, cleanNumberInput, fmtCount, fmtDate, marker,
  monthDay, monthDays, monthDayValue, monthName, numSize, plain, plainLines,
  showDate, showValue, todayMonthDay,
} from './format.ts'

test('a value typed in any interface locale reaches the API in one spelling', () => {
  for (const [typed, locale] of [
    ['1.000,5', 'de'], ['1 000,5', 'fr'], ['1 000,5', 'fr'],
    ['1 000,5', 'fr'], ['1,000.5', 'en'],
  ] as const) {
    assert.deepEqual(canonicalNumber(typed, locale), { value: '1000.5', grouped: true },
      `${typed} in ${locale}`)
  }
  // the same three spaces French accepts, because a keyboard, a paste and Intl
  // itself each produce a different one
  assert.deepEqual(canonicalNumber('1 000', 'en'), { value: '1 000', grouped: false },
    'English never grouped with a space')
})

test('a date is stored locale-neutral and read in the locale', () => {
  // The identity is one spelling and the reading is seven, which is the whole
  // reason the stored value is two numbers and a dash.
  assert.equal(showDate('12-25', 'en'), 'December 25')
  assert.equal(showDate('12-25', 'ko'), '12월 25일')
  assert.equal(showDate('12-25', 'de'), '25. Dezember')
  assert.equal(showDate('02-29', 'en'), 'February 29', 'a leap day is a fixed date')
  assert.equal(monthName(9, 'en'), 'September')
  // and it is asked off the row's format, never guessed from the characters:
  // a Mixed 12-25 is a different entry about a different thing
  assert.equal(showValue('12-25', false, 'en', 'CALENDAR'), 'December 25')
  assert.equal(showValue('12-25', false, 'en', 'MIXED'), '12-25')
  assert.equal(showValue('12-25', false, 'en'), '12-25', 'no format, no claim')
  // anything that is not a date comes back untouched, the same as a value
  // that is not a number does above
  for (const raw of ['1-5', '02-30', '13-01', '00-01', '12-00', '9¾', '']) {
    assert.equal(showDate(raw, 'en'), raw, raw)
    assert.equal(monthDay(raw), null, raw)
  }
  assert.deepEqual(monthDay('12-25'), [12, 25])
})

test('a date is picked, so the pair on screen is always a real one', () => {
  assert.equal(monthDays(2), 29, 'February, with no year to disagree')
  assert.equal(monthDays(4), 30)
  assert.equal(monthDays(1), 31)
  assert.equal(monthDayValue(4, 1), '04-01', 'zero-padded, which is the spelling')
  // moving off 31 January clamps rather than leaving a pair no month has
  assert.equal(monthDayValue(2, 31), '02-29')
  assert.equal(monthDayValue(4, 31), '04-30')
  assert.equal(todayMonthDay(new Date(2026, 8, 11)), '09-11')
  assert.equal(todayMonthDay(new Date(2024, 1, 29)), '02-29', 'a real leap day')
})

test('an invalid grouping is content and comes back untouched', () => {
  // Each of these would be a silent rewrite of what a stranger meant, which is
  // the one thing this function may not do.
  for (const raw of ['1,2,3', 'Apollo,11', '12,34', '.5', '1,00', '']) {
    assert.deepEqual(canonicalNumber(raw, 'en'), { value: raw, grouped: false }, raw)
  }
  // and an ungrouped number is not "invalid", it just has nothing to ungroup
  assert.deepEqual(canonicalNumber('1000', 'en'), { value: '1000', grouped: false })
})

test('punctuation follows the interface locale, identity does not', () => {
  assert.equal(showValue('1000', true, 'en'), '1,000')
  assert.equal(showValue('1000', true, 'de'), '1.000')
  assert.equal(showValue('1000', true, 'fr'), '1 000')
  assert.equal(showValue('1000000', true, 'en'), '1,000,000')
  assert.equal(showValue('1000.5', true, 'en'), '1,000.5')
  assert.equal(showValue('1000', false, 'en'), '1000', 'the flag is what decides')
  assert.equal(showValue('999', true, 'en'), '999', 'nothing to separate under four digits')
  assert.equal(showValue('11/22/63', true, 'en'), '11/22/63', 'not a localizable number')
  assert.equal(canGroupValue('999'), false)
  assert.equal(canGroupValue('1000'), true)
  assert.equal(canGroupValue('11/22/63'), false)
})

test('a twenty-digit entry survives, because none of this is a Number', () => {
  // past Number.MAX_SAFE_INTEGER: the point of doing the arithmetic on strings
  const huge = '12345678901234567890'
  assert.equal(showValue(huge, true, 'en'), '12,345,678,901,234,567,890')
  assert.deepEqual(canonicalNumber('12,345,678,901,234,567,890', 'en'),
    { value: huge, grouped: true })
  assert.notEqual(String(Number(huge)), huge, 'the assertion above would be luck otherwise')
})

test('a numeric field accepts its own locale punctuation and nothing else', () => {
  assert.equal(cleanNumberInput('12ab3.4', 'en', true), '123.4')
  assert.equal(cleanNumberInput('12ab3.4', 'en', false), '1234', 'no decimal point offered')
  assert.equal(cleanNumberInput('1.000,5', 'de', true), '1.000,5')
  assert.equal(cleanNumberInput('1 000,5', 'fr', true), '1 000,5')
})

test('the size class comes from the room the value needs', () => {
  assert.equal(numSize('7'), '')
  assert.equal(numSize('1234'), '')
  assert.equal(numSize('12345'), 'mid')
  assert.equal(numSize('1234567'), 'mid')
  assert.equal(numSize('12345678'), 'long')
  assert.equal(numSize('1960년 4월 16일 오후 3시'), 'long', 'a value is a string somebody typed')
})

test('a count is grouped by the interface locale', () => {
  assert.equal(fmtCount(1234567, 'en'), '1,234,567')
  assert.equal(fmtCount(1234567, 'de'), '1.234.567')
})

test('a date reads as a distance, and an unreadable one reads as itself', () => {
  const ago = (secs: number) => new Date(Date.now() - secs * 1000).toISOString()
  assert.equal(fmtDate(ago(90), 'en'), '1 minute ago')
  assert.equal(fmtDate(ago(7200), 'en'), '2 hours ago')
  assert.equal(fmtDate(ago(3 * 86400), 'en'), '3 days ago')
  assert.equal(fmtDate(ago(14 * 86400), 'en'), '2 weeks ago')
  assert.equal(fmtDate(ago(45 * 86400), 'en'), '1 month ago')
  // the year is twelve 30-day months, not 365 days: the five days between the
  // two definitions are what would otherwise come out as "12 months ago"
  assert.equal(fmtDate(ago(340 * 86400), 'en'), '11 months ago')
  assert.equal(fmtDate(ago(360 * 86400), 'en'), '1 year ago')
  assert.equal(fmtDate(ago(10), 'en'), 'just now')
  assert.equal(fmtDate(ago(10), 'ko'), '방금 전')
  assert.equal(fmtDate(ago(10), 'zz'), 'just now', 'a locale with no phrase of its own')
  assert.equal(fmtDate(ago(-60), 'en'), 'just now', 'a clock ahead of ours is skew, not news')
  assert.equal(fmtDate('whenever', 'en'), 'whenever', 'whatever the API said, unchanged')
})

test('a markdown body reads back as prose', () => {
  assert.equal(plain('## Head\ntext'), 'Head text')
  assert.equal(plain('> quote'), 'quote')
  assert.equal(plain('- item'), 'item')
  assert.equal(plain('**bold** and `code`'), 'bold and code')
  assert.equal(plain('[label](http://x)'), 'label')
  assert.equal(plain('![alt](http://x)'), 'alt')
  assert.equal(plain('snake_case and _wrapped_'), 'snake_case and wrapped')
  assert.equal(plain('```\ncode\n```\nafter'), 'after')
  assert.equal(plain('a\n\n\nb'), 'a b', 'a body with blank lines otherwise sprawls down a row')
})

test('a popover preview preserves the writer’s line breaks', () => {
  assert.equal(plainLines('First line\n\nSecond **line**\r\nThird'), 'First line\n\nSecond line\nThird')
})

/* marker returns a /g regex and Home.tsx feeds it to String.split, so the
   matches are the odd slots. Here it is asked for the matches directly, from a
   fresh copy each time -- a /g regex carries lastIndex between calls. */
const hits = (text: string, value: string, format = 'INTEGER', locale = 'en') =>
  text.match(new RegExp(marker({ value, format }, locale).source, 'gi'))

test('a number lights up where it is the whole number and nowhere else', () => {
  assert.deepEqual(hits('3.14 is pi', '3.14', 'DECIMAL'), ['3.14'])
  assert.equal(hits('13.14', '3.14', 'DECIMAL'), null, 'no seam inside a run of digits')
  assert.equal(hits('Catch-22', '2'), null, 'not two of this entry twos')
  assert.deepEqual(hits('The Two Popes (2019)', '2'), ['Two'], 'the word, not the year')
  assert.deepEqual(hits('1,000 and 1000', '1000'), ['1,000', '1000'],
    'written both ways, because the reader may have grouped it')
  assert.deepEqual(hits('1.000', '1000', 'INTEGER', 'de'), ['1.000'],
    'the German separator, and escaped -- an unescaped dot would match 1x000')
})

test('the spelled-out numbers only fire where they are a number', () => {
  assert.deepEqual(hits('Heptapod', '7'), ['Hepta'], 'a Greek root at the start of a word')
  assert.equal(hits('Bible', '2'), null, 'bi- mid-word is not a two')
  assert.deepEqual(hits('sixteen sixth six', '6'), ['sixth', 'six'],
    'the ordinal is a six, the teen is not')
  assert.equal(hits('sixty six', '6')?.length, 1, 'nor is the ty')
  assert.deepEqual(hits('eighth eight', '8'), ['eighth', 'eight'],
    'the longest form first, or eighth would light up as eight')
  assert.equal(hits('one hundred', '100', 'TIME'), null,
    'a TIME sort_key of 100 is 01:40, not a hundred')
})
