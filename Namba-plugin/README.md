# namba

A tiny Claude Code and Codex plugin that occasionally surfaces a random
[Namba](https://namba.chiral.kr) entry while you work — the open, no-login wiki
of what numbers mean.

## Install

### Claude Code

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

### Codex

The same marketplace, read by `codex` itself — there is no second manifest and
no second copy of the skill:

```sh
codex plugin marketplace add Dodant/Namba
codex plugin add namba@namba
```

## Usage

```
/namba:random-entry
```

Codex has no slash command for a skill — ask for it by name instead:

```
namba:random-entry
```

## Which kinds of entry

With nothing after it, anything on the wiki. Name the kinds you want instead,
by comma or by space, in any case:

```
/namba:random-entry time
/namba:random-entry integer, abbr
/namba:random-entry decimal mixed calendar
```

| | |
|---|---|
| `integer` | `42`, `1969`, `1024` |
| `decimal` | `3.14`, `1.618` |
| `mixed` | `K2`, `C-3PO` — numerals and letters together |
| `time` | `11:11`, `4:20` |
| `calendar` | `12-25`, `04-01` — a date with no year |
| `abbr` | `POV`, `UFO` — the wiki's abbreviations |

Anything else is not a kind, and the skill says so in one line rather than
quietly showing you everything. Each run asks for one of the kinds you named,
picked afresh, so `integer, abbr` over a morning is both of them. A kind
nothing is filed under yet answers with nothing, and the run stays quiet.

## Every 30 minutes

Claude Code only — `/loop` is its scheduler, and the plugin does not carry one
of its own:

```
/loop 30m /namba:random-entry
```

Any interval `/loop` takes works — `/loop 10m`, `/loop 1h`, `/loop 2h`. The
kinds go along with it:

```
/loop 30m /namba:random-entry integer abbr
```

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
other host is contacted. What comes back is a wiki anyone can write to without
an account, so the skill treats it as data rather than instructions and reads
only the two fields it prints. The wiki's entries are never bundled into the
plugin, so it shows what is on Namba today without the plugin being updated.

The request names itself — `User-Agent: namba-plugin` — so that Namba can
count how many installs are still being used, which is the one thing an open
wiki with no accounts cannot otherwise learn about its own plugin. That header
is everything the call says about you: no account, no cookie, no id, nothing
about your machine and nothing about what you are working on. Namba keeps a
salted hash of the address rather than the address, as one count per client per
day, and an operator sees a total. Take the `-A` out of the skill and the line
still prints; you are simply counted as nobody.

Needs `curl`. Nothing else.

## Licence

MIT — see [LICENSE](LICENSE).
