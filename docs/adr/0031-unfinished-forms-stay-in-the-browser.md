# ADR-0031: Unfinished main entry forms stay in the browser

- Status: accepted
- Date: 2026-09-16

## Context

The main form held unfinished text only in React state. Refreshing, following
a link or closing the tab lost it, even though the wiki already preserved
published edits through revisions. Reader accounts are deliberately absent.

## Decision

Keep one new-entry draft and one per edited entry in versioned localStorage.
Save the main form fields, numeric input locale, original main content and
base timestamp; do not cache complete server responses. Debounce typing and
flush when the page is left or backgrounded. Offer explicit Restore and Discard when reopened,
and clear the draft on successful publication or a server revision restore.
Cancel preserves the draft.

Use the original base timestamp on a recovered edit's first save. The current
entry fetched for the edit page must not make an old draft look current. A 409
retains the existing compare-and-save-again flow without merging fields. Also
compare the original main content with the loaded entry before submitting: the
server clock records seconds, so the timestamp alone cannot distinguish two
versions saved in the same second. This protects recovery; it does not change
the server's concurrency protocol for edits made after the page was loaded.

Validate stored shapes, report storage refusal, and check for another tab's
intervening write before replacing or removing a draft. This localStorage
comparison is best effort, not an atomic cross-tab lock.

## Consequences

- No account, draft API, database migration or new runtime dependency.
- Drafts stay on this browser and disappear when its site data is cleared.
- Translation and link panels remain separately saved operations.
- An upload reference is not a copy of its image. The server cannot see a
  local draft, so unpublished uploads retain the existing one-day collection
  grace period. A missing image must be removed and uploaded again.
- Node tests cover the storage contract; browser checks cover recovery,
  publication, navigation and stale edit conflicts.
