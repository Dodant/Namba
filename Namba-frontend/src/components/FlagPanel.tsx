import { useId, useState } from 'react'
import {
  api, DELETE_REASONS, nickname, REASON_LABEL, REPORT_REASONS,
} from '../api'

/* Two things a reader can do about an entry they think is wrong, and they are
   different things: one says "this is wrong", the other says "this should not be
   here". Folding them into one form with one reason list would have been less
   code and would have made the reader choose the wrong one -- "spam" and "delete
   this" are not the same request, and only the second needs a person to decide
   something irreversible-looking.

   A toggle rather than two panels: the fields are identical apart from the
   reason list and the nickname, and two collapsible sections in a rail that
   already has two is a rail nobody reads to the bottom of. */
const KINDS = [
  {
    key: 'report' as const,
    pill: 'Something is wrong',
    reasons: REPORT_REASONS,
    lead: 'Tells whoever runs the wiki. The entry stays where it is.',
    done: 'Reported. Whoever runs the wiki will see it.',
  },
  {
    key: 'remove' as const,
    pill: 'It should be removed',
    reasons: DELETE_REASONS,
    lead: 'Nobody can delete an entry here, so this asks a person to decide. '
      + 'If they agree, the entry comes off the wiki and can still be put back.',
    done: 'Asked. A person will read it and decide.',
  },
]

/** The third fold in the rail, after how the entry got here and what people
    make of it.

    It belongs on the read page for the reason the comment box does: it writes
    something *beside* the entry rather than changing it, so it does not go to
    `/edit` with the controls that do. And it is the whole replacement for the
    Delete button the edit form used to carry -- deleting stopped being one
    stranger's click and became a request, which is a thing that needs somewhere
    to be typed. */
export default function FlagPanel({ id }: { id: number | string }) {
  const uid = useId()
  const fid = (name: string) => `${uid}-${name}`
  const [kind, setKind] = useState<'report' | 'remove'>('report')
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [author, setAuthor] = useState(nickname.get())
  const [sent, setSent] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const mode = KINDS.find((k) => k.key === kind)!

  /* Switching sides clears the reason rather than keeping it: four of the ten
     reasons are in both lists, so keeping it would silently carry "Vandalism"
     across while dropping "An advertisement", which reads as a bug. */
  function pick(next: 'report' | 'remove') {
    setKind(next)
    setReason('')
    setErr('')
  }

  async function send() {
    if (!reason || busy) return
    setBusy(true)
    setErr('')
    try {
      if (kind === 'remove') {
        nickname.set(author)
        await api.requestDeletion(id, {
          reason, detail, author: author.trim() || 'anonymous',
        })
      } else {
        await api.report(id, { reason, detail })
      }
      setSent(mode.done)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details>
      <summary className="ix-fold">
        <h2 className="section">Flag a problem</h2>
      </summary>
      {sent ? (
        /* No form to come back to. The API refuses a second open one from the
           same reader anyway, and offering the box again only to answer 409
           would be the app pretending it did not just take this. */
        <p className="quiet" role="status">
          {sent}
        </p>
      ) : (
        <div className="cmt-form">
          <div className="flag-kind" role="group" aria-label="What kind of problem">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className={`btn ${k.key === kind ? 'on' : ''}`}
                aria-pressed={k.key === kind}
                onClick={() => pick(k.key)}
              >
                {k.pill}
              </button>
            ))}
          </div>
          <p className="quiet">{mode.lead}</p>
          <div className="field">
            <label htmlFor={fid('why')}>What is wrong</label>
            <div className="select">
              <select
                id={fid('why')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Pick one…</option>
                {mode.reasons.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor={fid('more')}>
              Details{' '}
              {/* 1000 is the detail cap in main.py, hand-copied the way every
                  other field cap is. Longer than a comment's 300 on purpose:
                  this is an argument addressed to one person, and the one thing
                  it has to be able to do is explain itself.

                  One word, because the label and this hint share a line and the
                  rail is 280px: "Anything else" plus the sentence wrapped into
                  four lines that read as one sentence broken in half. */}
              <span className="hint">optional, up to 1000</span>
            </label>
            <textarea
              id={fid('more')}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={kind === 'remove'
                ? 'Why should this go?'
                : 'What should it say instead?'}
              maxLength={1000}
            />
          </div>
          {/* Only the request takes a name, because only the request has one on
              the API. A report is read once by one person. */}
          {kind === 'remove' && (
            <div className="field">
              <label htmlFor={fid('nick')}>Your nickname</label>
              <input
                id={fid('nick')}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="anonymous"
                maxLength={40}
              />
            </div>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={busy || !reason}
            onClick={send}
          >
            {busy ? 'Sending…' : kind === 'remove' ? 'Ask for removal' : 'Report it'}
          </button>
        </div>
      )}
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </details>
  )
}
