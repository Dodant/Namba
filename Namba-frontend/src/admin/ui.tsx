import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fmtDate } from '../format'

/** The parts every page in the panel is made of. Small on purpose: a table, a
    badge, a hash, a timestamp and an empty state, which between them are most
    of what a back office is. The two hooks every page also repeats -- the
    filters that live in the URL and the busy-and-error dance around a decision
    -- are in `state.ts`, because a module that exports a component and a hook
    costs the panel its fast refresh. */

/** Keep a native <dialog> in step with the boolean that owns it.

    `showModal()` is imperative and the panel's state is not, so something has
    to bridge them -- and `Confirm` and `Drawer` below need the same ref and
    the same effect, so it is written once. */
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
export function Hash({ value, to }: { value: string | null | undefined; to?: string }) {
  if (!value) return <span className="hash">—</span>
  const seen = `${value.slice(0, 4)}***`
  /* A link where the panel can answer what it is for. Four characters are
     enough to compare two rows by eye; the question they raise -- "is this the
     same person as that one" -- is the log filtered by the whole hash, which
     is one route and used to be nowhere. */
  return to ? (
    <Link className="hash" to={to} title={`${value}\n\nEverything else from this client`}>
      {seen}
    </Link>
  ) : (
    <span className="hash" title={value}>
      {seen}
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

/** The top of a page: its name, and the one number that says whether it needs
    you.

    A heading over three lines of prose explaining what a page called Reports is
    for is prose an operator reads once and scrolls past forever after, and it
    costs the first row of the table the top of the screen every time. So the
    count sits on the heading line where it is the thing you land on, and `hint`
    is for the sentence that is genuinely not guessable from the page -- what
    a blank status column means, what a window is counted over -- and is left
    off where there is no such sentence. */
export function Head(
  { title, tally, hint, children }:
  { title: string; tally?: ReactNode; hint?: ReactNode; children?: ReactNode },
) {
  return (
    <div className="head">
      {/* The name, the number and any control on one row; the sentence on its
          own below. Not one flex line with the hint wrapping in it -- a
          `max-width` clamps a flex item's hypothetical size, so a capped
          paragraph happily sits up beside the heading and reads as part of
          it. */}
      <div className="head-row">
        <h1>{title}</h1>
        {tally != null && <span className="head-tally">{tally}</span>}
        {children && <div className="head-acts">{children}</div>}
      </div>
      {hint && <p className="lede">{hint}</p>}
    </div>
  )
}

/** A request that did not answer, and the way back.

    "Something went wrong" with no way forward makes a reload the only move,
    and a reload loses the filters, the scroll and the place in the queue. Every
    list in the panel reloads from one function, so handing that same function
    here is the whole fix. */
export function Fail({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  if (!msg) return null
  return (
    <p className="err" role="alert">
      <span>{msg}</span>
      {onRetry && (
        <button className="btn small" onClick={onRetry}>
          Try again
        </button>
      )}
    </p>
  )
}

/** Arrow keys down a list of rows.

    On `<tbody>` rather than on the document: a listener on the window has to
    know whether a dialog is open, whether the operator is typing, and which of
    two tables on the page is the one meant -- and the answer to all three is
    already in the DOM, because focus is where it is. Moving focus rather than
    tracking a cursor also brings scrolling-into-view and the focus ring for
    nothing, and `Escape` stays the dialog's.

    j and k as well as the arrows, because an operator working a queue has one
    hand on the keyboard and every tool they use already agrees on those two. */
function rowKeys(e: React.KeyboardEvent<HTMLTableSectionElement>) {
  const hit = e.target as HTMLElement
  /* not while the caret is in something: j is a letter first */
  if (hit.matches('input, select, textarea')) return
  const step = e.key === 'ArrowDown' || e.key === 'j' ? 1
    : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0
  if (!step) return
  const row = hit.closest('tr')
  const next = (step > 0 ? row?.nextElementSibling : row?.previousElementSibling)
    ?? (step > 0 ? e.currentTarget.firstElementChild : e.currentTarget.lastElementChild)
  if (!(next instanceof HTMLElement)) return
  e.preventDefault()
  next.focus()
}

/** A row you can land on and open.

    `<tr>` where the row is only a row; this where it stands for something an
    operator opens. Enter on the row and a click anywhere in it do the same
    thing, and both step aside for a control inside it -- a title link, a
    checkbox, the buttons at the end -- because a row-wide click that swallows
    its own links is worse than no row-wide click. */
export function Row(
  { onOpen, className, children }:
  { onOpen?: () => void; className?: string; children: ReactNode },
) {
  if (!onOpen) return <tr className={className}>{children}</tr>
  const spare = (t: EventTarget | null) =>
    t instanceof HTMLElement && !!t.closest('a, button, input, select, label')
  return (
    <tr
      className={`${className ?? ''} open`}
      tabIndex={0}
      onClick={(e) => { if (!spare(e.target)) onOpen() }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !spare(e.target)) {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      {children}
    </tr>
  )
}

/** A table in its own scroll port.

    The port is this wrapper and not the `<table>`: a table cannot be its own
    scroll box without giving up being a table box, which is what costs a screen
    reader the rows and columns. Columns of hashes are wide enough to need it. */
export function Table(
  { cols, busy, children }: { cols: ReactNode[]; busy?: boolean; children: ReactNode },
) {
  return (
    <div className="tbl-wrap">
      <table aria-busy={busy || undefined}>
        <thead>
          <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
        </thead>
        <tbody onKeyDown={rowKeys}>{children}</tbody>
      </table>
    </div>
  )
}

/** The table before its rows arrive.

    The same head and the same row height as what is coming, so the page does
    not jump when it does -- which is the whole argument over a centred word
    that occupies none of the space the answer will. It says "loading" once, to
    a screen reader, rather than eight times in eight cells. */
export function Loading({ cols, rows = 8 }: { cols: ReactNode[]; rows?: number }) {
  return (
    <Table cols={cols} busy>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {cols.map((_c, i) => (
            <td key={i}>
              <span className="skel" style={{ width: `${45 + ((r * 7 + i * 23) % 45)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </Table>
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
  { open, title, at, children, onClose, onStep }: {
    open: boolean
    title: ReactNode
    /** "3 of 24", when the drawer is standing in a queue. */
    at?: string
    children: ReactNode
    onClose: () => void
    /** Move to the next or previous row without closing. A queue is worked
        one item after another, and closing the sheet to click the row below
        costs the operator their place twice over -- once going out and once
        finding it again. Absent where the drawer is not standing in a list. */
    onStep?: (by: 1 | -1) => void
  },
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
      /* The same two keys as the table underneath, so stepping through a queue
         does not change hands when the sheet opens. Not while typing a note,
         and never a single key for a decision -- j moves, nothing destroys. */
      onKeyDown={(e) => {
        if (!onStep) return
        if ((e.target as HTMLElement).matches('input, select, textarea')) return
        const by = e.key === 'ArrowDown' || e.key === 'j' ? 1
          : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0
        if (!by) return
        e.preventDefault()
        onStep(by)
      }}
    >
      <div className="sheet-top">
        <h2>{title}</h2>
        {onStep && (
          <span className="sheet-step">
            {at && <span className="hash">{at}</span>}
            <button className="btn small" onClick={() => onStep(-1)} aria-label="Previous">
              ↑
            </button>
            <button className="btn small" onClick={() => onStep(1)} aria-label="Next">
              ↓
            </button>
          </span>
        )}
        <button className="btn small" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  )
}
