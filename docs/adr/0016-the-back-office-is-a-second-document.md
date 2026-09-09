# ADR-0016: The back office is a second document

- Status: accepted
- Date: 2026-08-20

## Context

`index.css` is roughly 1,600 lines of global rules in which every control is a
capsule and the type is a serif meant for reading. None of it belongs on a
table of hashes, and a route in the same bundle inherits all of it.

## Decision

`/admin` is a second Vite entry, `admin.html` → `src/admin/`, with its own
stylesheet that keeps the identity and changes the register. The API serves
`dist/admin.html` for `/admin*`; Vite is told the same in development. The
two stylesheets define the same custom property names with different values
and are never both loaded.

The panel has no editor of its own. "Edit on the wiki" opens the wiki's form,
because one place knows how a value is parsed. The number is the one
exception: the wiki refuses it to anonymity, so the panel is the only place it
can be corrected, and it still sends what was typed for the server to settle.

## History

- 2026-08-20 (`b2fc61c`, `d290497`): designed in
  `docs/superpowers/specs/2026-08-20-back-office-design.md`, then built.
