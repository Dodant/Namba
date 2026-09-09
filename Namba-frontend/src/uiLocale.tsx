/* oxlint-disable react/only-export-components -- the provider and its hook share
   one private context; splitting them would export that implementation detail. */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { MESSAGES, UI_LOCALES, type Messages, type UiLocale } from './locales'

/* Re-exported so a component that phrases something with `m` takes its type
   from the same module it takes `useUi` from. The words themselves, the list
   of locales and the type read off it are all in `./locales`. */
export type { Messages, UiLocale }

const UI_KEY = 'namba.uiLocale'
const UI_COOKIE = 'namba_ui_locale'

/* zh-Hans is the only code with a region in it, so a browser saying zh-CN or
   zh-TW is matched on the language subtag alone -- which is what the chain of
   startsWith this replaced did, one line per locale. */
const spokenHere = (tag: string) =>
  UI_LOCALES.find((l) => tag.toLowerCase().startsWith(l.code.split('-')[0]))?.code

export const uiLocale = {
  get: (): UiLocale =>
    UI_LOCALES.find((l) => l.code === localStorage.getItem(UI_KEY))?.code
    ?? spokenHere(navigator.language)
    ?? 'en',
  set: (locale: UiLocale) => localStorage.setItem(UI_KEY, locale),
}

/** How a revision's author reads in a byline.

    A delete snapshots under the author "deleted", which sits badly inside a
    sentence that already says "edited by" -- so it becomes the word for it
    instead. Here rather than in either page because both the read page's
    history and the edit form's History rail draw the same list, and the two
    had a copy each. */
export const revisionBy = (author: string, m: Messages) =>
  (author === 'deleted' ? m.post.deleted : m.post.editedBy(author))

type UiContextValue = {
  locale: UiLocale
  setLocale: (locale: UiLocale) => void
  m: Messages
}

const UiContext = createContext<UiContextValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(uiLocale.get)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = 'ltr'
    /* The server cannot read localStorage when it writes share-card and SEO
       titles. Mirror only this non-sensitive preference so a refreshed page's
       number punctuation agrees with the interface the reader selected. */
    document.cookie = `${UI_COOKIE}=${locale}; Max-Age=31536000; Path=/; SameSite=Lax`
  }, [locale])

  function setLocale(next: UiLocale) {
    uiLocale.set(next)
    setLocaleState(next)
  }

  return (
    <UiContext value={{ locale, setLocale, m: MESSAGES[locale] }}>
      {children}
    </UiContext>
  )
}

export function useUi() {
  const value = useContext(UiContext)
  if (!value) throw new Error('useUi must be used inside UiProvider')
  return value
}
