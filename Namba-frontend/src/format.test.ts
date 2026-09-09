/** What the comments in `format.ts` claim, as assertions.

    `node --test`, which is the platform's own runner: every function in that
    file takes a string and returns one, so there is nothing to render, nothing
    to mock and no reason to install a framework to find out. Node strips the
    types on the way in -- the same `erasableSyntaxOnly` the tsconfig already
    demands is what makes that possible -- so this file is also typechecked by
    `tsc -b` along with everything else under src/.

    It is deliberately not a test per branch. What is pinned here is the small
    set of rules those functions exist to keep, each of which is a sentence
    written in the source that nothing was checking: an invalid grouping is
    content, a value never becomes a Number, punctuation follows the interface
    locale while identity does not, and a number lights up where it is the whole
    number and nowhere else.
*/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canGroupValue, canonicalNumber, cleanNumberInput, fmtCount, fmtDate, marker,
  numSize, plain, showValue,
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
  assert.equal(plain('a\n\n\nb'), 'a b', 'a body with blank lines used to sprawl down a row')
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
