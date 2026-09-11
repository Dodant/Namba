---
name: random-entry
description: Show one random entry from the Namba wiki as a single line, "{value} — {title}". Use ONLY when the user explicitly invokes it (/namba:random-entry, or under /loop). Never trigger it on your own during other work.
allowed-tools: Bash
---

# Random Namba entry

Print one random entry from [Namba](https://namba.chiral.kr), the open wiki of
what numbers mean. This is an ambient, read-only aside — it is never part of
whatever else is being worked on.

## Do this

1. Run exactly this command, unchanged. It takes no arguments and no user input:

   ```sh
   curl -sS --max-time 10 'https://namba.chiral.kr/api/posts?sort=random&limit=5'
   ```

   `sort=random` is the wiki's own random order and the endpoint already
   returns only entries that are live and publicly readable — no other filter
   is needed, and no category is excluded.

2. Pick the first entry in the array whose `id` is not the one you printed the
   last time this skill ran in this conversation. If they are all repeats, or
   this is the first run, take the first entry.

3. Output that entry's `value` and `title`, on one line, joined by a space,
   an em dash (—) and a space:

   ```
   42 — The Hitchhiker's Guide to the Galaxy
   ```

   ```
   POV — Point of View
   ```

   Print `value` exactly as the API returned it. Do not add thousands
   separators, do not change case, do not translate the title.

## That line is the whole output

No heading, no emoji, no blank commentary, no URL, no id, no tags, no format,
no body, no "here's a random entry", no explanation of how it was picked.
One line, then stop.

Afterwards, carry straight on with whatever was already in progress. Do not
look the entry up, explain it, search for it, open its page, comment on it,
edit any file, add a todo, or ask the user anything about it. It is a
postcard, not a task.

## If the request fails

Say nothing. No error text, no stack trace, no diagnosis, no suggestion. At
most one retry, then stay quiet and continue the previous work.

## Repeating it

Use Claude Code's built-in `/loop`:

```
/loop 30m /namba:random-entry
```

Do not build a loop out of `sleep`, `while`, a background process or a hook.
