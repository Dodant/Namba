# ADR-0017: The front end has no test runner beyond `node --test`

- Status: accepted
- Date: 2026-09-09

## Context

A component test needs a renderer and a DOM, which is a dependency and a
config file. The typecheck and one build already catch most of what such a
test would, and every route the panel calls is covered on the API side.

## Decision

`npm test` is `node --test` over `src/**/*.test.ts` and nothing else. It covers
the pure formatting functions in `format.ts` and the draft storage
contract in `drafts.ts`. Draft storage takes a small storage interface, so the
checks can model refusal and competing writes without a DOM.
`erasableSyntaxOnly` keeps the sources runnable by Node directly. The typecheck is `tsc -b --noEmit`; a bare `tsc --noEmit` checks nothing, because
`tsconfig.json` is a solution file.

Typed message maps stand in for tests elsewhere: `Messages` is `typeof EN`,
so a locale missing a key does not compile, and `GUIDES` is
`Record<SectionId, Section>`, so a translation missing a section does not.

## Consequences

- The layout is checked by looking at it. If a component test is ever worth
  its dependency, that is a conversation to have then.

## History

- 2026-08-18: no test runner.
- 2026-09-09 (`1d8059e`): `node --test` for the pure functions.

- 2026-09-16: draft storage checks use the same Node runner (ADR-0031).
