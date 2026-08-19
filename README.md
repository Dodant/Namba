# Namba

An open wiki of numbers. Every number means something to someone — 42 is a book,
1885 is a film, 09:41 is a keynote — and this is where people write those meanings
down. No account, no login: anyone can read, post and edit.

Seeded from `Memorable Numbers.md` (183 entries).

## Running it

Two terminals.

```sh
# api  → http://127.0.0.1:8000
cd Namba-backend
uv venv --python 3.11 .venv          # first time only
uv pip install -r requirements.txt --python .venv/bin/python
.venv/bin/python seed.py --reset     # first time only
.venv/bin/uvicorn main:app --reload

# web  → http://localhost:5173  (proxies /api and /uploads to the api)
cd Namba-frontend
npm install
npm run dev
```

Self-check: `cd Namba-backend && .venv/bin/python test_namba.py`

## How it fits together

`Namba-backend` — FastAPI over stdlib `sqlite3`, no ORM. Four files that matter:

| file | what it holds |
|---|---|
| `main.py` | every route, the Pydantic models, the upload and rate limits |
| `db.py` | connection + schema |
| `numfmt.py` | `parse_number()` — a display string to a format and a sort key |
| `seed.py` + `seed_tags.py` | the markdown importer and its hand-written tags |

`Namba-frontend` — React + Vite, no state library and no UI kit. `src/api.ts` is
the whole client; `Browse.tsx` serves the number, tag and search pages because
they differ only by which filter they pass. The home page has two views off a
`?view=` param — the number index, and a feed of what was written most recently.

Every read page reads. The one control that changes an entry is the `Edit` pill
on `/p/:id`; everything that writes — languages, history, links, delete — is in
the form behind it.

### Numbers

A number is a column on a post, not a table — `/n/42` is a query. Each carries a
**format** and a **sort key**:

| format | example | sort key |
|---|---|---|
| `INTEGER` | `42`, `299792458` | the value |
| `DECIMAL` | `3.14`, `42.195` | the value |
| `TIME` | `10:04PM`, `09:41` | minutes past midnight |
| `MIXED` | `11/22/63`, `80/20`, `9¾` | none — sorts by string |

`parse_number()` guesses, and the poster can overrule it in the form. It has to
work that way: `11:11` is a clock, `1:29:300` is Heinrich's law, and nothing in
the string says which.

Only integers get a magnitude band (`1`, `10`, `100`, `1000`, `10000+`), because
banding a TIME by its sort key would file 09:41 under "100".

### Anyone can edit

There are no accounts, so there is no owner to check — every entry is open to
every visitor, and the post list offers an `edit` link on each card.

Two things keep that from being destructive. First, `author` records whoever
wrote an entry and is **never** overwritten; an editor is recorded separately in
`edited_by`, so a stranger's correction reads "written by seed, last edited by
arthur" rather than quietly stealing the byline. Second, every edit, restore and
delete snapshots the previous state into `revisions` first. That history reads
down the right-hand column of each entry and is restorable from the entry's edit
form. Those rows deliberately have no foreign key — they outlive the post they
describe, so a deletion is recoverable too, from the address the entry used to
have.

Writes are rate limited to 20/minute per IP, in memory. Uploads are capped at
5 MB, restricted to jpg/png/gif/webp, and always renamed to a server-generated
UUID.

### Other languages

An entry can carry the same content in as many languages as people care to add;
a tab strip above the title switches between them, with the entry as written
sitting under "Original". The language is a free-form label — 한국어, Japanese,
Español, whatever the person adding it calls it — with one row per language per
entry, so writing the same language twice edits it instead of duplicating it.

Translations follow the same rules as everything else: anyone can add, rewrite
or remove one, the first translator keeps the byline, and the change is
snapshotted into the entry's history first, so a removed translation is one
Restore away.

### Tags

20 of them, fixed: `MOVIE TV ANIME BOOK MUSIC GAME BRAND SPORTS SCIENCE MATH
TECH HISTORY RELIGION MEME PERSON PLACE MYTH SLANG RULE UNIT`. Up to 5 per post,
so a film of a book gets both.

## Deploying

The API is a single process with a SQLite file next to it — any box with a disk
will do. The front end is static (`npm run build` → `dist/`); point `VITE`'s
proxy targets at the real API host and configure the host to serve `index.html`
for unknown paths, or `/n/42` will 404 on refresh.

One caveat: the rate limiter lives in process memory, so it is per-worker. Run
one worker, or move it to redis.

## Known gaps

- 20 seeded entries still have Korean titles (`아비정전`, `36계 줄행랑`). Left
  verbatim rather than machine-translated — the wiki should fix them, now by
  adding an English tab beside the original.
- Search reads the entry itself, not its translations.
- `801.11` is in the data as written; the Wi-Fi standard is `802.11`.
- Search is `LIKE`. Fine for thousands of rows, not for millions.
