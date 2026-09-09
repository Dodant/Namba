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

The code is MIT, in `LICENSE`. The content and the code are different things
given away by different people, and a public repository with no licence is all
rights reserved. MIT is a default rather than a considered choice: swap it
before anyone forks if another suits.

## History

- 2026-08-20 (`844ef97`): CC0 stated in the footer and at the button.
- 2026-09-09 (`98ba5f3`): `LICENSE` added.
