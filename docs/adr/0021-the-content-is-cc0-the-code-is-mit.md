# ADR-0021: The content is CC0; the code is MIT

- Status: accepted
- Date: 2026-08-20 (content); 2026-09-09 (code)

## Decision

Everything readers write is CC0, stated where it is given away: a line at the
form's Publish button as well as the footer, because a waiver read after the
fact is not one. The byline stands as a record of who got there first, not a
right retained. `robots.txt` allows every crawler, AI crawlers included,
because blocking them would contradict the licence the site states on every
page.

The code is MIT, in `LICENSE`, copyright `maestr.oh`. The content and the code
are different things given away by different people, and a public repository
with no licence is all rights reserved -- which this one was, so anybody who
read it could not legally use any of it.

MIT rather than something stronger because there is nothing here to protect
that way: the content is already public domain, and a wiki of what numbers
mean is not a thing whose derivatives need forcing back open. `Dodant` stays
everywhere else it appears -- the repository URL, the GHCR namespace, the OIDC
subject the deploy role trusts -- because those are account names and not the
holder of anything.

## History

- 2026-08-20 (`844ef97`): CC0 stated in the footer and at the button.
- 2026-09-09 (`98ba5f3`): `LICENSE` added, MIT, as a default to be confirmed.
- 2026-09-10: confirmed, and the holder corrected from the GitHub account
  name to `maestr.oh`. The file was already public by then, so anything
  taken under the earlier line keeps the licence it was taken under --
  which is the same licence, so nothing turns on it.
