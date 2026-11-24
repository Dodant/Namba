/** Chains of names, worked out from single links.

    An Origins entry is one link: this name came from that one. Nothing stores
    a chain -- `JavaScript ← Java ← Java coffee ← Java` is four names and three
    entries, joined here because one entry's origin is another entry's name.
    So a chain grows when somebody files the next link, and no entry has to
    know it is part of one.

    Imports nothing, like `format.ts`, so `node --test` can run it as it is. */
export type Link = { name: string; origin: string; lang?: string | null }

/** How two spellings are compared: one name, one place in a chain. NFC and
    case folded for the comparison only -- what was typed is what is drawn. */
export const nameKey = (s: string) => s.normalize('NFC').trim().toLowerCase()

/** One entry per (name, origin) pair, the reader's language first. The same
    link written in Korean and in English is the same link told twice, and a
    list that draws both draws one chain two times. */
export function preferLang<T extends Link>(list: readonly T[], lang: string): T[] {
  // sort is stable, so within a language the API's order stands
  const ordered = lang
    ? [...list].sort((a, b) => Number(b.lang === lang) - Number(a.lang === lang))
    : list
  const seen = new Set<string>()
  return ordered.filter((e) => {
    const k = `${nameKey(e.name)}\n${nameKey(e.origin)}`
    return !seen.has(k) && !!seen.add(k)
  })
}

/** Name to the entry that says where it came from. First wins: a name with
    two origins filed is two entries, and a chain can only follow one. */
export function byName<T extends Link>(list: readonly T[]): Map<string, T> {
  const m = new Map<string, T>()
  for (const e of list) if (!m.has(nameKey(e.name))) m.set(nameKey(e.name), e)
  return m
}

/** `first`, then the entry for its origin, then that one's. The seen set is
    what ends a loop, should the data ever hold one. */
export function chain<T extends Link>(names: Map<string, T>, first: T): T[] {
  const out = [first]
  const seen = new Set([nameKey(first.name)])
  for (let k = nameKey(first.origin); !seen.has(k); ) {
    seen.add(k)
    const e = names.get(k)
    if (!e) break
    out.push(e)
    k = nameKey(e.origin)
  }
  return out
}

/** Does following `e` back arrive at `e`'s own name? */
export function loops(names: Map<string, Link>, e: Link): boolean {
  const target = nameKey(e.name)
  const seen = new Set<string>()
  for (let k = nameKey(e.origin); !seen.has(k); ) {
    if (k === target) return true
    seen.add(k)
    const next = names.get(k)
    if (!next) return false
    k = nameKey(next.origin)
  }
  return false
}

/** The list as chains. An entry a chain already draws gets no row of its
    own, and that is the entry `byName` holds for a name that is somebody's
    origin -- not every entry under that name. A name's second origin is in
    no chain, so without a row it would be live and on no page. */
export function rows<T extends Link>(list: readonly T[]): T[][] {
  const names = byName(list)
  const origins = new Set(list.map((e) => nameKey(e.origin)))
  return list
    .filter((e) => !origins.has(nameKey(e.name)) || names.get(nameKey(e.name)) !== e)
    .map((e) => chain(names, e))
}
