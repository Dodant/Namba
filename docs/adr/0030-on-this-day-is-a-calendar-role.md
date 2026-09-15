# ADR-0030: On this day is a mutually exclusive Calendar role

- Status: accepted
- Date: 2026-09-15

## Context

The Calendar index already separates deaths into an In Memoriam fold. A second
kind of dated entry is needed for historical events that happened on the date
without treating them as commemorations or memorials.

## Decision

Add `posts.on_this_day` as an entry-level flag. It remains a `CALENDAR` entry
with the same value, sort key, month band and `/c/MM-DD` address. The existing
`year` annotation is required for either On this day or In Memoriam.

The Calendar form presents ordinary date, On this day and In Memoriam as one
radio group. The API also rejects writes that set both dated flags, so the
mutual exclusion is not only a browser convention.

Each month renders On this day immediately above In Memoriam, with the same
closed disclosure treatment and no divider between them. Ordinary entries stay
in the month's main list. Splitting remains per entry, so one date can occur in
all three lists through different entries.

## Consequences

`on_this_day` follows the other content flags through public reads, snapshots,
restores, revision diffs and operator views. Migration step 6 adds it with a
false default, leaving every existing entry in its current role.
