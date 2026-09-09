# ADR-0012: A link in an entry stays a link

- Status: accepted
- Date: 2026-08-19

## Context

Rendering a card for a URL means the server fetching a URL a stranger typed.
With no accounts there is nobody to rate-limit or ban, and
`http://169.254.169.254/` in a post is an SSRF with a preview attached.

## Decision

No unfurling, no fetched thumbnails. Adding it would need a DNS-resolved
private-IP block that survives redirects, a size cap, a timeout and a cache,
and that guard work is larger than the feature.

The reader's side of the same argument is ADR-0019: an entry's picture is one
of this wiki's own uploads, never an outside URL the reader's browser fetches.

## History

- 2026-08-19 (`7ac7ee3`): decided against and recorded.
