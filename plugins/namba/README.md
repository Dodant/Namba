# namba

A tiny Claude Code plugin that occasionally surfaces a random
[Namba](https://namba.chiral.kr) entry while you work — the open, no-login wiki
of what numbers mean.

## Install

```
/plugin marketplace add Dodant/Namba
/plugin install namba@namba
```

`/plugin install` installs at **user** scope by default, so the plugin is
available in every project. Pick `project` to commit it to a repo's
`.claude/settings.json` for the whole team, or `local` to keep it to your own
checkout of that repo.

From a shell instead:

```sh
claude plugin marketplace add Dodant/Namba
claude plugin install namba@namba
```

If the skill does not show up straight away, run `/reload-plugins`.

## Usage

```
/namba:random-entry
```

## Every 30 minutes

```
/loop 30m /namba:random-entry
```

Any interval `/loop` takes works — `/loop 10m`, `/loop 1h`, `/loop 2h`.

## Example

```
42 — The Hitchhiker's Guide to the Galaxy
```

```
POV — Point of View
```

That one line is the entire output. No description, no URL, no commentary, and
nothing about your current work changes.

## What it does

One read of one public endpoint, `GET /api/posts?sort=random&limit=5` on
`namba.chiral.kr`, which returns only entries that are live and publicly
readable. Nothing is written, no file is touched, no credential is read, and no
other host is contacted. The wiki's entries are never bundled into the plugin,
so it shows what is on Namba today without the plugin being updated.

Needs `curl`. Nothing else.

## Licence

MIT — see [LICENSE](../../LICENSE) in the repository root.
