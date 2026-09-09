import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api, errorText, FORMATS, LANG_CODE, langLabel, nickname, TAG_MAX, tagLabel,
  TAGS_PER_POST, type Format, type Post, type Revision, type Tag, type Translation,
} from '../api'
import {
  canGroupValue, canonicalNumber, cleanNumberInput, fmtDate, showValue,
} from '../format'
import { useAsync } from '../useAsync'
import { revisionBy, useUi } from '../uiLocale'

/* What the number field takes, and whether separators mean anything, follow
   the format the poster picked. Auto-detect constrains nothing: nothing has
   been decided yet, and 11/22/63 has to stay typeable while it is the default.

   Filtering as you type rather than on the way out, and never rewriting what
   is already in the field when the format changes -- picking INTEGER by
   mistake with 11/22/63 in there should not silently turn it into 112263. */
const KEEP: Record<string, RegExp> = {
  /* Latin script only, which is the API's rule and not a keyboard
     preference: 유에프오 and УФО are the same abbreviation in another
     alphabet, and one /a/ page per alphabet is the split the one-spelling
     rule avoids. Digits belong here even though parse_number will not guess
     at them -- MP3 and Y2K are abbreviations somebody has to be able to file. */
  ABBR: /[^A-Za-z0-9.&/;-]/g,
}

const EXAMPLES: Record<string, string> = {
  '': '42 · 3.14 · 11/22/63 · 10:04PM · UFO',
  INTEGER: '42 · 1000 · 299792458',
  DECIMAL: '3.14 · 42.195',
  MIXED: '11/22/63 · 9¾ · 80/20',
  TIME: '10:04PM · 09:41',
  ABBR: 'UFO · R&D · MP3',
}

const examples = (format: string, locale: string) => EXAMPLES[format]
  .split(' · ')
  .map((value) => showValue(value, false, locale))
  .join(' · ')

// there is no thousand in 10:04PM, in 9¾ or in UFO
const groupable = (f: string) => f !== 'MIXED' && f !== 'TIME' && f !== 'ABBR'

/* Normalised the same way the API will normalise it, so a tag typed as "Book"
   turns the existing book chip on instead of looking like a second one. The
   API is still the one that decides -- this only keeps the form honest. */
function toggleTag(tags: Tag[], raw: Tag, keep = false) {
  const t = raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
  if (!t) return tags
  if (tags.includes(t)) return keep ? tags : tags.filter((x) => x !== t)
  return tags.length >= TAGS_PER_POST ? tags : [...tags, t]
}

/* A menu, not a text box. Typed freely, one language arrives as "Korean",
   "한국어" and "korean", which reads as three languages and filters as three
   -- and unlike a tag, nobody is coining a language, they are naming one that
   already exists. So it is picked here and nowhere else.

   Endonyms, because the name a language calls itself is the one a reader of
   it recognises: 한국어, not Korean. Not every language in the world, just
   the ones this wiki is plausibly written in -- adding one is a line here.
   English first because the wiki is English-first, then by rough reach.

   With the code beside it, because an endonym is only recognisable to someone
   who can already read it -- ไทย and العربية say nothing to everyone else,
   and (th) and (ar) do. A map rather than a list and a table of codes beside
   it, so adding a language stays one line and there is nothing to keep in
   step. Display only: lang is stored as the name and /api/languages counts
   the names, so a code never reaches the wire. */
/* The first key is also the default: "Written in" has no empty choice, so a
   new entry starts English and an old one with nothing recorded picks it up on
   the next save. Nothing on this wiki reads better for not knowing. */
const LANGS = Object.keys(LANG_CODE)

/* An entry written before this list, or before a line was taken out of it,
   keeps what it has: a form that loaded a language it cannot show would drop
   it on the next save, and the entry never asked to be edited that way. */
const langsWith = (cur: string) => (!cur || LANGS.includes(cur) ? LANGS : [cur, ...LANGS])

/* Every label carries an htmlFor to its control. A caption floating above a
   control names nothing, and a screen reader reads the field under it as an
   unnamed edit box.
   useId rather than fixed strings because a form is not guaranteed to be the
   only one on the page -- the translation editor below is a second set. */
export default function PostForm() {
  const { locale, m } = useUi()
  const { id } = useParams()
  const uid = useId()
  const fid = (name: string) => `${uid}-${name}`
  const [params] = useSearchParams()
  const nav = useNavigate()
  const editing = Boolean(id)

  const [value, setValue] = useState(() => showValue(params.get('value') ?? '', false, locale))
  /* ?format= comes from the "+ Add another meaning" pill on /a/UFO and /n/42.
     Auto-detect would get an abbreviation right by luck and a number that
     somebody filed as Mixed wrong every time. */
  const [format, setFormat] = useState<'' | Format>(
    (FORMATS as readonly string[]).includes(params.get('format') ?? '')
      ? (params.get('format') as Format)
      : '',
  )
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [image, setImage] = useState<string | null>(null)
  const [lang, setLang] = useState(LANGS[0])
  const [grouped, setGrouped] = useState(false)
  // what this form is about right now: "number" until Abbreviation is picked
  const noun = m.common.subject(format === 'ABBR')
  const [coined, setCoined] = useState('')
  /* the chips are the wiki's working vocabulary, not a list in here. Capped so
     the form cannot grow without bound as people coin more, and unioned with
     what this entry already carries so a rare tag never falls off the end. */
  const vocab = useAsync(() => api.tags(), [])
  const [author, setAuthor] = useState(nickname.get())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* a 5 MB upload over a slow line is several seconds in which the field
     looked exactly as it did before the file was picked */
  const [uploading, setUploading] = useState(false)
  /* the whole entry, not just the fields: the three panels below edit its
     translations, its revisions and its links, none of which are form values */
  const [post, setPost] = useState<Post | null>(null)
  const [revBump, setRevBump] = useState(0)
  const [revs, setRevs] = useState<Revision[]>([])
  const owner = post?.author ?? ''
  const canonical = canonicalNumber(value, locale)
  const groupedPreview = showValue(canonical.value, true, locale)

  /* the fields follow the entry only when the entry itself is replaced -- an
     initial load or a restore. Linking or translating must not walk over a
     title someone is halfway through typing. */
  function fill(p: Post) {
    setPost(p)
    setValue(p.value)
    setFormat(p.format)
    setTitle(p.title)
    setBody(p.body)
    setTags(p.tags)
    setImage(p.image)
    setLang(p.lang ?? LANGS[0])
    setGrouped(p.grouped)
  }

  useEffect(() => {
    if (!id) return
    api.post(id).then(fill, (e) => setErr(errorText(e)))
  }, [id])

  useEffect(() => {
    if (!id) return
    api.revisions(id).then(setRevs, (e) => setErr(errorText(e)))
  }, [id, revBump])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    nickname.set(author)
    const payload = {
      value,
      /* Two people can have this form open, filled from the entry as it was
         when each of them opened it -- and it sends every field on every save,
         so without this the second to press Publish writes their copy of the
         fields they never touched over the other's edit, silently. `post` is
         the entry as loaded and every panel action below replaces it, so this
         moves whenever the server says the entry did. */
      ...(editing && post ? { base_updated_at: post.updated_at } : {}),
      ...(!editing ? { number_locale: locale } : {}),
      format: format || null,
      title,
      body,
      image,
      author: author.trim() || 'anonymous',
      tags,
      lang: lang.trim() || null,
      grouped,
    }
    try {
      const saved = editing
        ? await api.update(Number(id), payload)
        : await api.create(payload)
      nav(`/p/${saved.id}`)
    } catch (e) {
      setErr(errorText(e))
      setBusy(false)
    }
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    setUploading(true)
    try {
      setImage((await api.upload(file)).url)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setUploading(false)
    }
  }

  /* every panel action returns the entry as it now stands, so they all land
     the same way and any of them can report the same error */
  async function run(fn: () => Promise<Post>, replaces = false) {
    setErr('')
    try {
      const next = await fn()
      if (replaces) fill(next)
      else setPost(next)
    } catch (e) {
      setErr(errorText(e))
    }
  }

  return (
    /* History is a reference while you work, not a step in the work: down the
       middle of the form it sat between two things you were filling in. Beside
       it is where the read page already keeps it. */
    <div className="form-layout">
      <form className="form" onSubmit={submit}>
        <h1>{editing ? m.form.editTitle : m.form.addTitle}</h1>
        <p className="form-intro">
          {editing
            ? m.form.editIntro(owner)
            : m.form.addIntro}{' '}
          {/* Outside the ternary: both branches want it. The rule this form
              cannot enforce is which numbers are worth an entry -- 3 is a
              valid value whether it is the Trinity or the third GTA -- so the
              one place it can be said is next to the person about to type
              one. */}
          <Link to="/guide">{m.form.guidelines}</Link>.
        </p>

        <div className="row">
          {/* An entry is a meaning of one number, and /n/42 is a query on
              this column -- so retyping it here would not correct an entry,
              it would move it to a page about something else and leave 42
              short one meaning. readOnly rather than disabled: the number is
              the first thing you check before editing the rest, and disabled
              takes it out of the tab order and reads as "unavailable". */}
          <div className="field num-field">
            {/* the label follows the format, the same way the filtering,
                the keyboard and the separator box beside it do: with
                Abbreviation picked, "Number" is the wrong word for the box
                you are typing UFO into. Auto-detect keeps Number, because
                that is what most of this wiki is. */}
            <label htmlFor={fid('value')}>
              {format === 'ABBR' ? m.form.abbreviation : m.form.number}{' '}
              <span className="hint">
                {editing ? m.form.fixedValue(noun) : examples(format, locale)}
              </span>
            </label>
            <input
              id={fid('value')}
              className="mono"
              required
              readOnly={editing}
              maxLength={32}
              value={editing ? showValue(value, grouped, locale) : value}
              inputMode={format === 'INTEGER' ? 'numeric' : format === 'DECIMAL' ? 'decimal' : undefined}
              onChange={(e) => {
                const kept = format === 'INTEGER' || format === 'DECIMAL'
                  ? cleanNumberInput(e.target.value, locale, format === 'DECIMAL')
                  : KEEP[format]
                    ? e.target.value.replace(KEEP[format], '')
                    : e.target.value
                /* case is kept: SaaS is spelled SaaS. The API still keeps
                   ufo and UFO on one page by adopting the spelling already
                   stored, so what is typed is a proposal, not the address */
                setValue(kept)
                /* Typing the locale's grouping marks is itself a request to
                   keep displaying them, just as typing 1,000 always was. */
                if (format !== 'ABBR' && canonicalNumber(kept, locale).grouped) {
                  setGrouped(true)
                }
              }}
            />
            {/* under the number it rewrites, not a third column in the row:
                the row is two fields wide, and a column that came and went as
                you chose a format re-measured Number and Format underneath the
                choice.

                It waits for a fourth digit. Separators are the same rule on
                both sides -- 4+ digits, because there is no thousand in 100 --
                so under that the box was a control you could tick and untick
                with nothing on the page changing either way, which reads as
                broken rather than as inapplicable. canGroupValue counts the
                canonical number's integer digits, so 3.14159 has nothing to
                group after the point.

                The tick survives a value that drops back under four digits.
                grouped is display only and showValue ignores it there, so
                nothing shows and nothing is lost when the digit comes back. */}
            {groupable(format) && canGroupValue(canonical.value) && (
              <label className="field check">
                <input
                  type="checkbox"
                  checked={grouped}
                  onChange={(e) => setGrouped(e.target.checked)}
                />
                {m.form.groupThousands}
                <span className="hint">{groupedPreview}</span>
              </label>
            )}
          </div>
          <div className="field fmt-field">
            <label htmlFor={fid('format')}>{m.form.format}</label>
            {/* a wrapper only so the caret can be a ::after that follows the
                theme; a background-image would have baked its colour in */}
            <div className="select">
              <select
                id={fid('format')}
                value={format}
                onChange={(e) => {
                  const next = e.target.value as '' | Format
                  setFormat(next)
                  // the control is about to disappear, so the flag goes with it
                  if (!groupable(next)) setGrouped(false)
                }}
              >
                <option value="">{m.form.autoDetect}</option>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {m.format[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor={fid('title')}>
            {m.form.title}{' '}
            <span className="hint">{m.form.titleHint}</span>
          </label>
          <input
            id={fid('title')}
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={m.form.titlePlaceholder}
          />
        </div>

        <div className="field">
          <label htmlFor={fid('body')}>
            {m.form.details}{' '}
            <span className="hint">{m.form.detailsHint}</span>
          </label>
          <textarea
            id={fid('body')}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={m.form.detailsPlaceholder}
          />
          <p className="fine">
            {m.form.markdown}
          </p>
        </div>

        {/* "Written in", not "Language" -- the Languages panel below lists the
            same entry written again, and two adjacent fields a plural apart
            read as the same control twice */}
        {/* narrow caps the control, not the field -- on the field it caps the
            label with it */}
        <div className="field">
          <label htmlFor={fid('lang')}>{m.form.writtenIn}</label>
          <div className="select narrow">
            <select id={fid('lang')} value={lang} onChange={(e) => setLang(e.target.value)}>
              {/* minus whatever is already a tab below: the Languages panel has
                  always kept the entry's own language off its menu, and this is
                  the same rule from the other side -- picking 한국어 here on an
                  entry that already has a 한국어 version is the entry twice, and
                  the tab bar cannot say which of the two it is offering. The
                  backend answers 422 either way round. */}
              {langsWith(lang)
                .filter(
                  (l) => l === lang || !(post?.translations ?? []).some((t) => t.lang === l),
                )
                .map((l) => (
                  <option key={l} value={l}>
                    {langLabel(l)}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {post && (
          <>
            <Languages post={post} lang={lang} onSaved={setPost} onError={setErr} bumpRevs={() => setRevBump((n) => n + 1)} />

            <LinkPanel post={post} onLinked={setPost} onError={setErr} />
          </>
        )}

        {/* a caption over a row of chips and a text box, not a label for one
            control -- so a group with a name, and the box names itself */}
        <div className="field" role="group" aria-labelledby={fid('cats')}>
          <span className="field-label" id={fid('cats')}>
            {m.form.categories}{' '}
            <span className="hint">
              {m.form.categoryHint(TAGS_PER_POST)}
            </span>
          </span>
          <div className="chips">
            {[...new Set([...(vocab.data ?? []).slice(0, 24).map((v) => v.tag), ...tags])].map(
              (t: Tag) => (
                <button
                  type="button"
                  key={t}
                  className={`chip ${tags.includes(t) ? 'on' : ''}`}
                  aria-pressed={tags.includes(t)}
                  onClick={() => setTags(toggleTag(tags, t))}
                >
                  {tagLabel(t)}
                </button>
              ),
            )}
          </div>
          <div className="coin">
            <input
              value={coined}
              maxLength={TAG_MAX}
              aria-label={m.form.newCategoryAria}
              placeholder={m.form.newCategory}
              /* folded as it is typed, not on the way out, so the field shows
                 the tag that will actually be made */
              onChange={(e) => setCoined(e.target.value.toLowerCase())}
              onKeyDown={(e) => {
                // Enter adds the tag rather than publishing the entry
                if (e.key !== 'Enter') return
                e.preventDefault()
                setTags(toggleTag(tags, coined, true))
                setCoined('')
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={!coined.trim() || tags.length >= TAGS_PER_POST}
              onClick={() => {
                setTags(toggleTag(tags, coined, true))
                setCoined('')
              }}
            >
              {m.form.add}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor={fid('image')}>
            {m.form.image}{' '}
            <span className="hint">{m.form.imageHint}</span>
          </label>
          {image ? (
            <div className="file-row">
              <img className="thumb" src={image} alt="" decoding="async" />
              <button type="button" className="pill" onClick={() => setImage(null)}>
                {m.form.remove}
              </button>
            </div>
          ) : (
            <>
              <input
                id={fid('image')}
                className="file"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={pickImage}
              />
              {uploading && (
                <p className="fine" role="status">
                  {m.form.uploading}
                </p>
              )}
            </>
          )}
        </div>

        <div className="field nick-field">
          <label htmlFor={fid('author')}>
            {m.form.nickname}{' '}
            <span className="hint">
              {editing ? m.form.editorHint : m.form.noAccountHint}
            </span>
          </label>
          <input
            id={fid('author')}
            maxLength={40}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder={m.common.anonymous}
          />
        </div>

        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}

        <div className="actions">
          {/* the button went grey and kept its old label, which on a slow save
              is a form that looks broken rather than busy */}
          <button className="btn primary" disabled={busy}>
            {busy
              ? editing
                ? m.form.saving
                : m.form.publishing
              : editing
                ? m.form.saveChanges
                : m.form.publish}
          </button>
          <button type="button" className="btn" onClick={() => nav(-1)}>
            {m.common.cancel}
          </button>
        </div>
        {/* Here rather than only in the footer, because this is the one moment
            a reader gives something away: CC0 is a waiver, and a waiver read
            after the fact is not one. Same line either way -- an edit is a
            contribution too. */}
        <p className="fine">
          {m.form.cc0(editing)}
        </p>
      </form>

      {post && (
        <aside className="side form-side">
          <div className="field" role="group" aria-labelledby={fid('hist')}>
            <span className="field-label" id={fid('hist')}>
              {m.form.history}{' '}
              <span className="hint">{m.form.historyHint}</span>
            </span>
            <div className="panel">
              <div className="panel-row now">
                <div className="panel-main">
                  <span className="panel-t now">{post.title}</span>
                  <span className="panel-m">
                    {m.form.current} ·{' '}
                    {post.edited_by ? m.post.editedBy(post.edited_by) : m.common.by(post.author)}
                  </span>
                </div>
              </div>
              {revs.map((r) => (
                <div className="panel-row" key={r.id}>
                  <div className="panel-main">
                    <span className="panel-t">{r.title}</span>
                    <span className="panel-m">
                      {revisionBy(r.author, m)} · {fmtDate(r.at, locale)}
                    </span>
                  </div>
                  {/* type=button and outside the form both, so a restore can
                      never be mistaken for a submit */}
                  <button
                    type="button"
                    className="pill"
                    onClick={() =>
                      run(
                        () => api.restore(post.id, r.id, nickname.get() || 'anonymous'),
                        true, // a restore replaces the entry, so the fields follow it
                      ).then(() => setRevBump((n) => n + 1))
                    }
                  >
                    {m.common.restore}
                  </button>
                </div>
              ))}
              {!revs.length && (
                <div className="panel-row panel-empty">{m.post.noEdits}</div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}


/** The entry written again in other languages. Rewriting one opens it in
    place; removing it lives inside that, behind the row rather than beside
    Rewrite, so a destructive control is never one slip from a benign one. */
function Languages({
  post,
  lang,
  onSaved,
  onError,
  bumpRevs,
}: {
  post: Post
  lang: string
  onSaved: (p: Post) => void
  onError: (m: string) => void
  bumpRevs: () => void
}) {
  const { m } = useUi()
  const [open, setOpen] = useState<Translation | 'new' | null>(null)
  const gid = useId()
  /* The entry's own language and every language already on the list. A second
     version in a language that is already here is not a new one: UNIQUE(post_id,
     lang) turns it into an edit of that version, so "+ Add a language" would
     quietly overwrite one. And a translation into the entry's own language is
     the entry twice. Neither is worth a menu line. */
  const taken = [lang, ...(post.translations ?? []).map((t) => t.lang)]

  return (
    <div className="field" role="group" aria-labelledby={gid}>
      <span className="field-label" id={gid}>
        {m.form.translations}{' '}
        <span className="hint">{m.form.translationsHint}</span>
      </span>
      {open ? (
        <TranslationEditor
          post={post}
          taken={taken}
          editing={open === 'new' ? null : open}
          onCancel={() => setOpen(null)}
          onSaved={(next) => {
            onSaved(next)
            bumpRevs() // a translation is an edit of the entry
            setOpen(null)
          }}
          onError={onError}
        />
      ) : (
        <div className="panel">
          {/* the entry's own language has no Rewrite: the fields above are its
              editor, and a second one here would be two homes again */}
          <div className="panel-row now">
            {/* the live field, not post.lang: the select above is what this
                entry will be written in the moment it saves, and a panel that
                still says plain "Original" disagrees with it on screen */}
            <span className="panel-lang">{m.post.original(lang)}</span>
            <span className="panel-title">{post.title}</span>
            <span className="panel-by">{post.author}</span>
          </div>
          {post.translations?.map((t) => (
            <div className="panel-row" key={t.id}>
              <span className="panel-lang">{t.lang}</span>
              <span className="panel-title">{t.title}</span>
              <span className="panel-by">{t.edited_by ?? t.author}</span>
              <button type="button" className="pill" onClick={() => setOpen(t)}>
                {m.form.editTranslation}
              </button>
            </div>
          ))}
          <div className="panel-row">
            <button type="button" className="panel-add" onClick={() => setOpen('new')}>
              {m.form.addTranslation}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Write this entry in another language, or rewrite one that is already here.
    Not a <form>: it sits inside the entry form, and a nested one would submit
    the outer one on Enter. */
function TranslationEditor({
  post,
  taken,
  editing,
  onSaved,
  onCancel,
  onError,
}: {
  post: Post
  taken: string[]
  editing: Translation | null
  onSaved: (next: Post) => void
  onCancel: () => void
  onError: (m: string) => void
}) {
  const { m } = useUi()
  const [lang, setLang] = useState(editing?.lang ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [author, setAuthor] = useState(nickname.get())
  const uid = useId()
  const fid = (name: string) => `${uid}-${name}`

  async function save() {
    if (!lang.trim() || !title.trim()) return onError(m.form.requiredTranslation)
    onError('')
    nickname.set(author)
    try {
      onSaved(
        await api.translate(post.id, {
          lang,
          title,
          body,
          author: author || 'anonymous',
        }),
      )
    } catch (e) {
      onError(errorText(e))
    }
  }

  async function drop() {
    if (!editing) return
    if (!confirm(m.form.removeTranslationConfirm(editing.lang))) return
    onError('')
    try {
      onSaved(await api.untranslate(post.id, editing.id, nickname.get() || 'anonymous'))
    } catch (e) {
      onError(errorText(e))
    }
  }

  return (
    <div className="panel panel-edit">
      <div className="field">
        <label htmlFor={fid('lang')}>
          {m.form.language}{' '}
          <span className="hint">{m.form.languageHint}</span>
        </label>
        {/* the language names the tab, so changing it would orphan the old one;
            rewrite the text here and add a new tab for a different language */}
        <div className="select">
          <select
            id={fid('lang')}
            value={lang}
            disabled={!!editing}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="">{m.form.pickOne}</option>
            {langsWith(lang)
              .filter((l) => l === lang || !taken.includes(l))
              .map((l) => (
                <option key={l} value={l}>
                  {langLabel(l)}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={fid('title')}>
          {m.form.title}{' '}
          <span className="hint">{m.form.translationTitleHint}</span>
        </label>
        <input
          id={fid('title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="field">
        <label htmlFor={fid('body')}>
          {m.form.details}{' '}
          <span className="hint">{m.form.optionalMarkdown}</span>
        </label>
        <textarea
          id={fid('body')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
        />
      </div>
      <div className="field">
        <label htmlFor={fid('author')}>{m.form.nickname}</label>
        <input
          id={fid('author')}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={m.common.anonymous}
          maxLength={40}
        />
      </div>
      <div className="actions">
        <button type="button" className="btn primary" onClick={save}>
          {editing ? m.common.save : m.form.addThisTranslation}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {m.common.cancel}
        </button>
        {editing && (
          <>
            <span className="spacer" />
            <button type="button" className="btn danger" onClick={drop}>
              {m.form.removeTranslation}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Search the wiki and attach another entry to this one. Not a <form> for the
    same reason as above; Enter in the field still searches. */
function LinkPanel({
  post,
  onLinked,
  onError,
}: {
  post: Post
  onLinked: (p: Post) => void
  onError: (m: string) => void
}) {
  const { locale, m } = useUi()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Post[] | null>(null)
  const [finding, setFinding] = useState(false)
  const gid = useId()

  async function search() {
    /* the same rule the header pill keeps: an empty box is not a search for
       nothing. api.posts drops an empty q and hands back the whole wiki */
    if (!q.trim() || finding) return
    onError('')
    setFinding(true)
    try {
      const found = await api.posts({ q, limit: 8 })
      setHits(found.filter((p) => p.id !== post.id))
    } catch (e) {
      onError(errorText(e))
    } finally {
      setFinding(false)
    }
  }

  async function act(fn: () => Promise<Post>) {
    onError('')
    try {
      onLinked(await fn())
    } catch (e) {
      onError(errorText(e))
    }
  }

  return (
    <div className="field" role="group" aria-labelledby={gid}>
      <span className="field-label" id={gid}>
        {m.form.related}{' '}
        <span className="hint">{m.form.relatedHint}</span>
      </span>
      <div className="panel">
        {post.related?.map((r) => (
          <div className="panel-row" key={r.id}>
            <span className="panel-num">{showValue(r.value, r.grouped, locale)}</span>
            <span className="panel-title ink">{r.title}</span>
            <button type="button" className="pill" onClick={() => act(() => api.unlink(post.id, r.id))}>
              {m.form.unlink}
            </button>
          </div>
        ))}
        <div className="panel-row panel-find">
          <input
            value={q}
            aria-label={m.form.linkSearchAria}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                search()
              }
            }}
            placeholder={m.form.linkSearchPlaceholder}
          />
          <button
            type="button"
            className="btn"
            disabled={!q.trim() || finding}
            onClick={search}
          >
            {finding ? m.form.searching : m.form.search}
          </button>
        </div>
        {hits?.map((h) => (
          <div className="panel-row" key={h.id}>
            <span className="panel-num">{showValue(h.value, h.grouped, locale)}</span>
            <span className="panel-title ink">{h.title}</span>
            <button
              type="button"
              className="pill"
              onClick={async () => {
                await act(() => api.link(post.id, h.id))
                const rest = hits.filter((x) => x.id !== h.id)
                setHits(rest.length ? rest : null) // not "no matches" -- none left
              }}
            >
              {m.form.link}
            </button>
          </div>
        ))}
        {hits?.length === 0 && <div className="panel-row panel-empty">{m.form.noMatches}</div>}
      </div>
    </div>
  )
}
