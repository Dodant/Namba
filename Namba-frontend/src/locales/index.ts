/** Every interface locale: the list, the type read off it, and the words.

    One file collecting seven documents, the same shape `src/guide/index.ts`
    has for the rules page — and for the same reason. `MESSAGES` is typed
    `Record<UiLocale, Messages>`, so a locale in the list with no map, or a map
    with a key missing, does not compile. That is the check this app has
    instead of a test runner.

    Adding a locale is a line in `UI_LOCALES`, a file beside this one, and a
    line in `MESSAGES`. Nothing else: the union type, the footer's `<option>`s,
    the saved-value check and the `navigator.language` match all read the list.
*/
import { EN, type Messages } from './en'
import { KO } from './ko'
import { JA } from './ja'
import { ZH_HANS } from './zh-Hans'
import { ES } from './es'
import { FR } from './fr'
import { DE } from './de'

export type { Messages }

/** In the order the footer's picker offers them, each under the name it calls
    itself — an endonym, because that is the name a reader of it recognises. */
export const UI_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: '한국어' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
] as const

export type UiLocale = (typeof UI_LOCALES)[number]['code']

export const MESSAGES: Record<UiLocale, Messages> = {
  en: EN, ko: KO, ja: JA, 'zh-Hans': ZH_HANS, es: ES, fr: FR, de: DE,
}
