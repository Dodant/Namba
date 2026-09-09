import { useEffect, useId, useRef, type ReactNode } from 'react'
import { fmtDate } from '../format'

/** The parts every page in the panel is made of. Small on purpose: a table, a
    badge, a hash, a timestamp and an empty state, which between them are most
    of what a back office is. The two hooks every page also repeats -- the
    filters that live in the URL and the busy-and-error dance around a decision
    -- are in `state.ts`, because a module that exports a component and a hook
    costs the panel its fast refresh. */

/** Keep a native <dialog> in step with the boolean that owns it.

    `showModal()` is imperative and the panel's state is not, so something has
    to bridge them -- and `Confirm` and `Drawer` below had the same ref and the
    same effect, letter for letter. */
function useDialog(open: boolean) {
  const box = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = box.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return box
}

/** The reason an operator gives for what they just did.

    Its own component because six confirmations ask for one and they are the
    same field every time, down to the `.field` wrapper -- what differs is the
    sentence over it, which is what says where the note ends up: on the block,
    on the request, on each report. Every one of them is optional, and every
    one of them is read by the next operator, which is the whole argument for
    asking. */
export function NoteField(
  { label, value, placeholder, onChange }:
  { label: string; value: string; placeholder: string; onChange: (v: string) => void },
) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

/** A status word. Four tones and no more: fine, waiting, wrong, and neutral for
    anything that is just a fact. Which word maps to which tone is decided in
    one place below, so ACTIVE cannot be green here and grey two pages over. */
const TONE: Record<string, 'ok' | 'warn' | 'bad'> = {
  ACTIVE: 'ok',
  APPROVED: 'ok',
  RESOLVED: 'ok',
  HIDDEN: 'warn',
  PENDING: 'warn',
  OPEN: 'warn',
  FLAGGED: 'warn',
  DELETED: 'bad',
  REJECTED: 'bad',
  BLOCKED: 'bad',
  IGNORED: 'ok',
  ADMIN: 'ok',
  SUPER_ADMIN: 'ok',
  REVOKED: 'bad',
}

export function Badge({ children }: { children: string }) {
  return <span className={`badge ${TONE[children] ?? ''}`}>{children}</span>
}

/** Four hex characters and the rest in a tooltip for ordinary list rows.

    It is a salted hash of an address rather than an address, and forty more
    characters of it on screen buy nothing readable -- what an operator actually
    does with one is compare two rows, and four is enough to do that by eye.
    Block confirmations show eight characters, where the target is being acted
    on; the whole value is still there to copy, because a block needs it. */
export function Hash({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="hash">—</span>
  return (
    <span className="hash" title={value}>
      {value.slice(0, 4)}***
    </span>
  )
}

/** How long ago, with the exact stamp on hover.

    Relative because every question here is about freshness -- "is this
    happening now" -- and absolute underneath because the one time an operator
    needs the real timestamp is when they are writing it into a note. `fmtDate`
    is the wiki's, so the two sides of the product say "2 days ago" the same
    way. */
export function When({ at }: { at: string | null | undefined }) {
  if (!at) return <span className="when">—</span>
  return (
    <span className="when" title={at}>
      {fmtDate(at)}
    </span>
  )
}

/** A table in its own scroll port.

    The port is this wrapper and not the `<table>`: a table cannot be its own
    scroll box without giving up being a table box, which is what costs a screen
    reader the rows and columns. Columns of hashes are wide enough to need it. */
export function Table({ cols, children }: { cols: ReactNode[]; children: ReactNode }) {
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** What a list says when it has nothing to say. A distinct component because
    "nothing here" and "still loading" are different answers and a table that
    shows the first while meaning the second is a lie. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="empty" role="status">
      {children}
    </p>
  )
}

/** 51–100 of 812, and the two arrows.

    A count and a window rather than page numbers: an operator's question is
    "how much is left", and page 7 of 17 answers it worse than 301–350 of 812
    does. Both buttons stay in place when they cannot be used -- a control that
    disappears at the end of a list moves the other one under the cursor. */
export function Pager(
  { total, limit, offset, onGo }:
  { total: number; limit: number; offset: number; onGo: (next: number) => void },
) {
  if (total <= limit) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <div className="pager">
      <span className="num">
        {from}–{to} of {total}
      </span>
      <button
        className="btn small"
        disabled={offset === 0}
        onClick={() => onGo(Math.max(0, offset - limit))}
      >
        ← Newer
      </button>
      <button
        className="btn small"
        disabled={to >= total}
        onClick={() => onGo(offset + limit)}
      >
        Older →
      </button>
    </div>
  )
}

/** Ask before doing something that looks irreversible.

    A native `<dialog>`, not a div with a backdrop: `showModal()` brings the
    focus trap, Escape, `::backdrop` and an inert page with it, all of which
    would otherwise be a hundred lines of hand-rolled and half of it wrong. Not
    `window.confirm` either -- it blocks the event loop and cannot hold the note
    field half of these actions want.

    The copy always says what will happen and what will survive it, because on
    this wiki the second half is the surprising one: hiding an entry keeps its
    history, its comments and its translations, and the operator needs to know
    that before they press rather than after. */
export function Confirm(
  { open, title, verb, danger, busy, children, onCancel, onOk }: {
    open: boolean
    title: string
    verb: string
    danger?: boolean
    busy?: boolean
    children: ReactNode
    onCancel: () => void
    onOk: () => void
  },
) {
  const box = useDialog(open)

  return (
    <dialog
      className="ask"
      ref={box}
      /* Escape fires this. Cancelling our own way rather than letting the
         browser close it keeps the caller's state and the element in step. */
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
    >
      <h2>{title}</h2>
      <div className="ask-body">{children}</div>
      <div className="ask-acts">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? 'danger' : 'primary'}`}
          onClick={onOk}
          disabled={busy}
        >
          {busy ? 'Working…' : verb}
        </button>
      </div>
    </dialog>
  )
}

/** A sheet at the right-hand edge, for the detail behind a row.

    The same `<dialog>` `Confirm` uses and for the same reasons -- focus trap,
    Escape, an inert page -- just parked against the edge instead of the middle.
    A row you have to leave the list to read is a row you stop reading, and the
    list is where an operator's place in the queue lives. */
export function Drawer(
  { open, title, children, onClose }:
  { open: boolean; title: ReactNode; children: ReactNode; onClose: () => void },
) {
  const box = useDialog(open)

  return (
    <dialog
      className="sheet"
      ref={box}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="sheet-top">
        <h2>{title}</h2>
        <button className="btn small" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  )
}
