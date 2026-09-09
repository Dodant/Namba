import { fmtCount } from '../format'
import { GLOBAL_NAV, GLOBAL_TERMS } from './shared'

/** English, and the shape every other locale is checked against.

    `Messages` is `typeof EN`, so a locale file missing a key or
    misspelling one does not compile — which is the check this app has
    instead of a test runner, the same bargain `src/guide/outline.ts`
    makes for the rules page. Add a key here first. */
export const EN = {
  siteTitle: 'Namba — a wiki of numbers',
  tagline: 'An open wiki about numbers',
  common: {
    loading: 'Loading…',
    backToIndex: 'Back to the index.',
    addFirst: 'Add the first one.',
    anonymous: 'anonymous',
    cancel: 'Cancel',
    save: 'Save',
    edit: 'edit',
    restore: 'Restore',
    by: (name: string) => `by ${name}`,
    edited: (when: string, name?: string | null) =>
      `edited ${when}${name ? ` by ${name}` : ''}`,
    entries: (n: number) => `${fmtCount(n, 'en')} ${n === 1 ? 'entry' : 'entries'}`,
    tags: (n: number) => `${fmtCount(n, 'en')} ${n === 1 ? 'tag' : 'tags'}`,
    subject: (abbr: boolean, n = 1): string =>
      abbr ? (n === 1 ? 'abbreviation' : 'abbreviations') : n === 1 ? 'number' : 'numbers',
  },
  format: {
    INTEGER: 'Integer', DECIMAL: 'Decimal', MIXED: 'Mixed', TIME: 'Time', ABBR: 'Abbreviation',
  },
  buckets: {
    '1': '1 – 9', '10': '10 – 99', '100': '100 – 999',
    '1000': '1,000 – 9,999', '10000+': '10,000 and up',
  },
  header: {
    searchLabel: 'Search the wiki by number, title or text',
    ...GLOBAL_NAV, backToTop: 'Back to top',
  },
  random: {
    failed: (error: string) => `Couldn’t pick one — ${error}.`,
    empty: 'Nothing to pick from yet.',
  },
  footer: {
    cc0Before: 'Everything written here is',
    /* The leading space is load-bearing and belongs to the sentence, not to
       the component: this half follows the CC0 link, and only a language that
       puts a space before a word wants one. Korean, Japanese and Chinese
       continue straight off the link with a particle. In the component it
       would be a locale set to keep in step, reading as a styling decision. */
    cc0After: ' — public domain. Take it, quote it, or feed it to a machine; no permission or credit is needed. The byline remains to record who wrote it first.',
    privacy: 'No account is required. Raw IP addresses and user-agent strings are not stored; salted hashes are kept to prevent abuse and enforce blocks.',
    guidelines: 'Entry guidelines', source: GLOBAL_TERMS.github, apiOpen: 'open, no key.',
    interfaceLanguage: 'Interface', contentLanguage: 'Entry text',
    interfaceAria: 'Interface language', contentAria: 'Preferred entry language',
    asWritten: 'As written', translatedCount: (lang: string, n: number) => `${lang} · ${fmtCount(n, 'en')}`,
  },
  home: {
    seeMore: 'See more',
    hasImage: 'has an image',
    feedIntro: 'Recent entries and edits, newest first.',
    empty: 'Nothing written yet.',
    entryKinds: 'Entry format', categories: 'Categories', all: 'All',
    foldedEntries: (n: number) => `${fmtCount(n, 'en')} entries`,
    bandCount: (subjects: number, subject: string, entries: number) =>
      `${fmtCount(subjects, 'en')} ${subject} · ${fmtCount(entries, 'en')} ${entries === 1 ? 'entry' : 'entries'}`,
  },
  browse: {
    category: 'Category', search: GLOBAL_TERMS.search,
    summary: (n: number, abbr: boolean) =>
      `${n === 1 ? 'One entry explains' : `${fmtCount(n, 'en')} entries explain`} this ${abbr ? 'abbreviation' : 'number'}.`,
    addMeaning: '+ Add another meaning',
    emptyValue: (value: string) => `Nothing filed under ${value} yet.`,
    giveMeaning: 'Give it a meaning.',
    emptyTag: (tag: string) => `Nothing tagged ${tag} yet.`,
    noMatches: (q: string) => `No matches for “${q}”. Try another word, or`,
    addNewEntry: 'add a new entry.',
  },
  post: {
    openFailed: (error: string) => `Couldn’t open this entry — ${error}.`,
    usedToSay: 'What it used to say',
    restoreHelp: 'Nothing here is lost. Restoring puts the entry back at this same address, so existing links still work.',
    language: 'Language', original: (lang?: string | null) => lang ? `Original (${lang})` : 'Original',
    showCredits: 'Show credits', hideCredits: 'Hide credits', edit: 'Edit',
    writtenBy: (name: string, when: string) => `Written by ${name} · ${when}`,
    lastEditedBy: (name: string, when: string) => `Last edited by ${name} · ${when}`,
    translationCredit: (lang: string, author: string, editor: string | null, when: string) =>
      `${lang} added by ${author}${editor ? `, last edited by ${editor}` : ''} · ${when}`,
    originalCredit: (lang?: string | null) => lang ? `Originally written in ${lang}` : 'Original version',
    editPromise: 'Anyone can edit — every version is kept, so nothing is lost.',
    noDetails: 'No details yet.', sayMeaning: 'Say what it means.', related: 'Related entries',
    editHistory: 'Edit history', current: 'current', noEdits: 'No edit history yet.',
    comments: 'Comments', nickname: 'Your nickname', saySomething: 'Say something',
    commentLimit: 'at most 300 characters', commentPlaceholder: 'What do you think?',
    posting: 'Posting…', postComment: 'Post', more: (n: number) => `${fmtCount(n, 'en')} more`,
    noComments: 'No comments yet.', deleted: 'deleted', editedBy: (name: string) => `edited by ${name}`,
  },
  form: {
    editTitle: 'Edit entry', addTitle: 'Add an entry',
    editIntro: (owner: string) => `Anyone can edit this entry${owner ? `, including one written by ${owner}` : ''}. The version you replace stays in the history, and ${owner || 'the original author'} remains credited.`,
    addIntro: 'One entry per meaning. If 42 already exists, this joins it rather than replacing it.',
    guidelines: 'Entry guidelines', fixedValue: (noun: string) => `fixed — another ${noun} is another entry`,
    number: 'Number', abbreviation: 'Abbreviation', groupThousands: 'Use thousands separators',
    format: 'Format', autoDetect: 'Auto-detect', title: 'Title', titleHint: 'what it refers to',
    titlePlaceholder: "The Hitchhiker's Guide to the Galaxy",
    details: 'Details', detailsHint: 'optional — why this number, what it means',
    detailsPlaceholder: 'The Answer to the Ultimate Question of Life, the Universe, and Everything.',
    markdown: 'Markdown works — **bold**, *italic*, [links](https://…), lists, headings and tables. A single Enter is a line break.',
    writtenIn: 'Written in', categories: 'Categories',
    categoryHint: (n: number) => `up to ${fmtCount(n, 'en')} — a film adapted from a book can use both`,
    newCategoryAria: 'Name a new category', newCategory: 'or name your own', add: 'Add',
    image: 'Image', imageHint: 'optional — jpg, png, gif or webp, up to 5 MB', remove: 'Remove',
    uploading: 'Uploading…', nickname: 'Your nickname', editorHint: 'recorded as the editor, not the author',
    noAccountHint: 'no account, no password', saving: 'Saving…', publishing: 'Publishing…',
    saveChanges: 'Save changes', publish: 'Publish',
    cc0: (editing: boolean) => `${editing ? 'Saving' : 'Publishing'} releases this contribution under CC0. Anyone may reuse it for any purpose without asking.`,
    history: 'History', historyHint: 'restore an earlier version at this same address', current: 'current',
    translations: 'Translations', translationsHint: 'this entry in other languages',
    editTranslation: 'Edit translation', addTranslation: '+ Add translation',
    requiredTranslation: 'A language and a title are required.',
    removeTranslationConfirm: (lang: string) => `Remove the ${lang} translation? It stays in the entry’s history.`,
    language: 'Language', languageHint: 'the language used for this translation', pickOne: 'Pick one…',
    translationTitleHint: 'the entry’s title in that language', optionalMarkdown: 'optional — Markdown works here too',
    addThisTranslation: 'Add translation', removeTranslation: 'Remove translation',
    related: 'Related entries', relatedHint: 'other numbers that belong beside this one', unlink: 'Unlink',
    linkSearchAria: 'Search the wiki for an entry to link',
    linkSearchPlaceholder: 'Search the wiki — e.g. Back to the Future', searching: 'Searching…',
    search: GLOBAL_TERMS.search, link: 'Link', noMatches: 'No matches.',
  },
  flag: {
    heading: 'Flag a problem', kindAria: 'What kind of problem', report: 'Something is wrong',
    remove: 'It should be removed', reportLead: 'Send a report to the moderators. The entry will remain visible.',
    removeLead: 'Ask a moderator to remove this entry. If approved, it will be hidden and can be restored.',
    reported: 'Report sent. A moderator will review it.', requested: 'Removal requested. A moderator will review it.',
    whatWrong: 'What is wrong', pickOne: 'Pick one…', details: 'Details', detailHint: 'optional, up to 1000',
    removePlaceholder: 'Why should this entry be removed?', reportPlaceholder: 'What should it say instead?',
    nickname: 'Your nickname', sending: 'Sending…', askRemoval: 'Ask for removal', reportIt: 'Report it',
  },
  reasons: {
    DUPLICATE: 'It duplicates another entry', INCORRECT: 'The information is wrong',
    NO_SOURCE: 'There is no reliable source', SOURCE: 'The source is wrong or missing',
    SPAM: 'Spam', AD: 'An advertisement', ABUSE: 'Abusive or hateful',
    COPYRIGHT: 'A copyright problem', VANDALISM: 'Vandalism', OTHER: 'Something else',
  },
  guide: { readIn: 'Read these rules in', addEntry: 'Add an entry.' },
  notFound: 'Nothing here.',
  broke: 'This page could not be drawn.',
}

export type Messages = typeof EN
