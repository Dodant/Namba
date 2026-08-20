import type { ReactNode } from 'react'
import { fmtDate } from '../api'

/** The parts every page in the panel is made of. Small on purpose: a table, a
    badge, a hash, a timestamp and an empty state, which between them are most
    of what a back office is. */

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

/** Four hex characters and the rest in a tooltip.

    It is a salted hash of an address rather than an address, and forty more
    characters of it on screen buy nothing readable -- what an operator actually
    does with one is compare two rows, and four is enough to do that by eye. The
    whole thing is still there to copy, because a block needs it. */
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
