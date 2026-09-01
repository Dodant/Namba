import { LANG_CODE } from '../api'
import en from './en'
import ko from './ko'
import type { GuideDoc } from './outline'

/* Every translation of the rules page, keyed by the same endonym LANG_CODE
   uses -- so the picker's labels come from langLabel like the form's do, and
   there is no second spelling of a language anywhere.

   English is first and is the one the others are measured against: when a rule
   changes it changes there, and a translation still on the old version says so
   at the top of itself rather than quietly stating a rule that no longer
   holds. Adding a language is a file and a line here.

   Not /api/languages, which is a different question with a different answer.
   That counts what readers have translated *entries* into and is empty on a
   fresh wiki; this is what the project has translated *this document* into.
   One of them can be long while the other is one line. */
export const GUIDES: Record<string, GuideDoc> = { English: en, '한국어': ko }

export const BASE_LANG = 'English'

/* ?lang=ko rather than ?lang=한국어: it is a link an operator pastes into a
   delete request, and a percent-encoded endonym is not one. The code is the
   short name for the same thing LANG_CODE already maps. */
export const byCode = (code: string | null) =>
  code
    ? Object.keys(GUIDES).find((l) => LANG_CODE[l] === code.toLowerCase())
    : undefined

export const codeOf = (lang: string) => LANG_CODE[lang] ?? lang
