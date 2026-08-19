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

An entry's details are markdown — bold, italics, links, lists, headings, quotes,
code and tables — rendered on the entry page. Lists show it read back as plain
prose instead, clamped to three lines, since a preview with `**` in it is not a
preview. Raw HTML in a post is escaped rather than rendered: anyone can write
here, so nothing anyone writes becomes markup.

Writes are rate limited to 20/minute per IP, in memory. Uploads are capped at
5 MB, restricted to jpg/png/gif/webp, and always renamed to a server-generated
UUID.

### Other languages

An entry can carry the same content in as many languages as people care to add;
a tab strip above the title switches between them, with the entry as written
sitting under "Original". The language is a free-form label — 한국어, Japanese,
Español, whatever the person adding it calls it — with one row per language per
entry, so writing the same language twice edits it instead of duplicating it.

The entry can say what it is itself written in, in the form's "Written in"
field, and then the tab reads "Original (한국어)" rather than leaving the reader
to work it out from the title. It is optional and blank on everything written
before the field existed; nothing guesses on an entry's behalf.

A picker in the header sets which language the **lists** are read in — the
index, the feed, a number, a tag, a search. An entry that has been written in
that language shows that version; an entry that has not keeps its own title and
body, so a wiki nobody has finished translating still reads as a wiki rather
than as a page of gaps. The options come from the translations that exist, not
a fixed list, and the setting lives in `localStorage` like the nickname. Entry
pages ignore it: they have a tab strip, and switching there is the reader's own
move.

Translations follow the same rules as everything else: anyone can add, rewrite
or remove one, the first translator keeps the byline, and the change is
snapshotted into the entry's history first, so a removed translation is one
Restore away.

### Tags

20 of them, fixed: `MOVIE TV ANIME BOOK MUSIC GAME BRAND SPORTS SCIENCE MATH
TECH HISTORY RELIGION MEME PERSON PLACE MYTH SLANG RULE UNIT`. Up to 5 per post,
so a film of a book gets both.

## Deploying

One process. `npm run build` writes `Namba-frontend/dist/`, and the API serves
it: built assets by path, `index.html` for everything else, so `/n/42` survives
a refresh without a rewrite rule. A SQLite file sits next to it, and any box
with a disk will do.

They are served together rather than split so that `/p/42` can carry its own
`<head>`. A share of an entry has to arrive with that entry's title, blurb and
picture already in the markup — no crawler runs the JavaScript that would set
them — so something has to write the `<head>` per request, and the only process
holding the entry is this one. `NAMBA_DIST` overrides where it looks.

In development nothing of that runs: `npm run dev` serves the app and proxies
`/api` here, which is why the injection is covered by `test_share_card` rather
than by looking at it.

One caveat: the rate limiter lives in process memory, so it is per-worker. Run
one worker, or move it to redis.

## Known gaps

- 20 seeded entries still have Korean titles (`아비정전`, `36계 줄행랑`). Left
  verbatim rather than machine-translated — the wiki should fix them, now by
  adding an English tab beside the original.
- Search reads the entry itself, not its translations.
- `801.11` is in the data as written; the Wi-Fi standard is `802.11`.
- Search is `LIKE`. Fine for thousands of rows, not for millions.
