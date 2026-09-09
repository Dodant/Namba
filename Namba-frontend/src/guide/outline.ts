/* The rules page's shape, written once and shared by every translation.

   The point of it being here rather than in each language file is that a
   translation is the same document in another language, not another document.
   It supplies words for these sections and it cannot reorder them, drop one or
   invent one -- `/guide#mining` has to be the same section in English and in
   Korean, or an operator quoting a rule to a poster is quoting a different
   rule depending on which language they happened to be reading.

   That is enforced rather than remembered: SectionId is the union below, a
   GuideDoc's `sections` is a Record over it, and a language file missing a
   section does not compile. There is no runtime check because there is nothing
   left for one to catch.

   '--' draws a rule. The first divides the test from the rules, the second the
   half a poster reads from the half an operator does, and the third the
   reference from the summary. */
export const OUTLINE = [
  /* Definitions first, because everything under them leans on the difference
     between an entry and a number page and a reader arriving from the footer
     has no reason to know it. */
  ['terms', 2],
  ['test', 2],
  ['--', 0],
  ['the-point', 2],
  ['sequences', 2],
  ['mining', 2],
  ['why', 2],
  ['never', 2],
  ['what-happens', 2],
  ['--', 0],
  ['by-subject', 2],
  ['works', 3],
  ['dates', 3],
  ['science', 3],
  ['tech', 3],
  ['brands', 3],
  ['people', 3],
  ['places', 3],
  ['internet', 3],
  ['writing', 2],
  ['many', 3],
  ['duplicates', 3],
  ['boxes', 3],
  ['--', 0],
  ['four', 2],
] as const

export type SectionId = Exclude<(typeof OUTLINE)[number][0], '--'>

/* `body` is markdown and renders above the table, `note` below it. One
   section wants a note -- works, where a number in a title is argued and the
   table needs a sentence afterwards rather than a row. Standard markdown, not the entry body's
   dialect: remark-breaks is there because a reader typing into a textarea
   expects Enter to break a line, and this is a file in the repository where a
   blank line means what it means everywhere else. */
export type Section = {
  heading: string
  body?: string
  rows?: readonly (readonly [string, string])[]
  note?: string
}

export type GuideDoc = {
  /* Bumped by hand when a rule changes, not when a typo is fixed -- it is
     what a delete request cites, so it has to mean "the rules moved". */
  version: string
  /* ISO, and rendered as an absolute date: the one place in this app that
     does not use fmtDate. Every other date here is a byline or an edit and is
     read to answer how fresh a thing is, where "2 days ago" is the right
     axis. A version needs a fixed point instead -- "changed 5 months ago" on
     a rule somebody is quoting at you answers a question nobody asked. */
  updated: string
  title: string
  /* Markdown, and rendered as prose rather than as one <p>: a guide's opening
     is what the wiki is, what an entry is and what happens before publishing,
     which is three paragraphs in any language that has tried to say it in
     one. A single-paragraph lede renders exactly as it did. */
  lede: string
  /* The two column heads every subject table wears. Here and not in
     Guide.tsx, because they are the page's own words rather than the wiki's:
     spelled in the component, eight Korean tables sit under "An entry / Not
     an entry" and are eight tables half in the wrong language. */
  columns: readonly [string, string]
  /* Shown only on a translation the English guide has moved past, so it is
     the one sentence a reader of it most needs and the one most likely to be
     the reason they cannot rely on the page. In their language, therefore --
     an English warning on a Korean document is a warning for somebody who was
     not going to need it. {mine} and {base} take the two versions. */
  stale: string
  sections: Record<SectionId, Section>
}
