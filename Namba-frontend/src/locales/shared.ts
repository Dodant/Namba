/** The words that stay the same in every interface locale.

    Wayfinding, not consequential actions: Recent, Random, Add and the search
    box only help a reader move around, and one compact English product
    vocabulary is easier to recognise across languages than seven translations
    of "Random". Publish, Save, Delete, Restore and every confirmation are
    localized, because the outcome of those matters. The descriptive search
    aria-label is localized too — it is a sentence, not a signpost.
*/
export const GLOBAL_NAV = {
  searchPlaceholder: 'Search…',
  recent: 'Recent',
  random: 'Random',
  add: 'Add',
  suggestions: 'Suggestions',
  allResults: 'See all results',
} as const

export const GLOBAL_TERMS = {
  search: 'Search',
  github: 'GitHub',
} as const
