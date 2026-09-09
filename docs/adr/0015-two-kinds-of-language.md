# ADR-0015: Interface locale and entry language are two things

- Status: accepted
- Date: 2026-09-02

## Context

Changing the buttons to Korean must not silently replace which translation of
an entry somebody chose to read, and a number's punctuation belongs to the
reader's locale while its identity does not.

## Decision

The interface locale (`namba.uiLocale`, mirrored to the `namba_ui_locale`
cookie) changes Namba's own controls, copy, dates and number punctuation, and
what the server writes into the head. The entry-text preference
(`namba.contentLang`) changes only which translation the list APIs prefer,
falling back to the original. Its options come from `/api/languages`, the
translations that exist.

Number punctuation follows the interface locale; number identity does not
(ADR-0005). Links are built from the stored value, never the displayed one.

## Consequences

- Seven interface locales are seven files under `src/locales/`, typed against
  the English one so a missing key does not compile.
- Entry titles, bodies and an Article's `inLanguage` are content and are never
  translated by the interface choice.

## History

- 2026-09-02 (`fce51d6`, `840619b`, `40597fc`): the two preferences separated,
  localised notation end to end, localised server metadata.
