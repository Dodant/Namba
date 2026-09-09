import { useEffect, useState } from 'react'
import { errorText } from '../../api'
import { adm, type Operator, type Role, type Who } from '../api'
import { useAction } from '../state'
import { Badge, Confirm, Empty, Table, When } from '../ui'

const FLOOR = 12

/** Who can sign in here.

    Readable by any operator and changeable only by a super admin: who else can
    act here is not a secret from the people who can act here, but the list is
    not theirs to edit.

    There is still no signup. This form needs a live super admin session, which
    means the chain has to start outside the browser -- `python admin.py add
    you@example.com`, and the first account created is a super admin whatever
    the flags say, because otherwise nobody could ever make the second. */
export default function Operators({ who }: { who: Who }) {
  const [rows, setRows] = useState<Operator[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, run] = useAction(setErr)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('ADMIN')
  const [ask, setAsk] = useState<Operator | null>(null)

  const boss = who.role === 'SUPER_ADMIN'

  function load() {
    setRows(null)
    adm.admins().then(setRows, (e) => setErr(errorText(e)))
  }

  useEffect(load, [])

  function make(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setErr('')
    run(async () => {
      await adm.addAdmin({ email: email.trim(), password, role })
      setEmail('')
      setPassword('')
      setRole('ADMIN')
      load()
    })
  }

  function flip() {
    if (!ask) return
    run(async () => {
      await adm.setAdminActive(ask.id, !ask.active)
      setAsk(null)
      load()
    })
  }

  return (
    <div className="page">
      <h1>Operators</h1>
      <p className="lede">
        The only accounts in the wiki. Readers have none and there is no signup —
        an account can only come from a shell or from a super admin here.
      </p>

      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}

      {!rows ? (
        <Empty>Loading…</Empty>
      ) : (
        <Table cols={['Email', 'Role', '2FA', 'Since', 'Last signed in', 'State', '']}>
          {rows.map((a) => (
            <tr key={a.id} className={a.active ? '' : 'dim'}>
              <td>
                {a.email}
                {a.id === who.id && <span className="hash"> · you</span>}
              </td>
              <td className="tight">
                <Badge>{a.role}</Badge>
              </td>
              <td className="tight">
                <Badge>{a.totp_enabled ? 'TOTP' : 'SETUP NEEDED'}</Badge>
              </td>
              <td className="tight">
                <When at={a.created_at} />
              </td>
              <td className="tight">
                {a.last_login_at ? <When at={a.last_login_at} /> : <span className="hash">never</span>}
              </td>
              <td className="tight">
                {a.active ? <Badge>ACTIVE</Badge> : <Badge>REVOKED</Badge>}
              </td>
              <td className="acts">
                {/* Not on your own row, and the API refuses it too: the mistake
                    is unrecoverable from inside the panel. Doing it anyway is a
                    shell command, which is the right place for a decision that
                    can lock the door from the outside. */}
                {boss && a.id !== who.id ? (
                  <button
                    className={`btn small ${a.active ? 'danger' : ''}`}
                    onClick={() => setAsk(a)}
                  >
                    {a.active ? 'Revoke' : 'Restore'}
                  </button>
                ) : (
                  <span className="hash">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {boss ? (
        <section className="stat-group new-op">
          <h2>Add an operator</h2>
          <form className="bar" onSubmit={make}>
            <div className="field grow">
              <label htmlFor="op-email">Email</label>
              <input
                id="op-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field grow">
              <label htmlFor="op-pw">
                Password{' '}
                <span className="hash">at least {FLOOR}</span>
              </label>
              {/* The one place in the panel that takes a password. It is
                  never echoed back by the API and nothing here keeps it after
                  the request: what comes back is an id and an email. */}
              <input
                id="op-pw"
                type="password"
                autoComplete="new-password"
                minLength={FLOOR}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="op-role">Role</label>
              <select
                id="op-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="ADMIN">ADMIN — can moderate</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN — and can add operators</option>
              </select>
            </div>
            <button
              className="btn primary"
              type="submit"
              disabled={busy || password.length < FLOOR}
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </form>
          <p className="lede">
            Tell them the password out of band, then enroll their authenticator
            from the server with <code>python admin.py totp-enroll their@address</code>.
            Until that is done, the password cannot sign in. Password changes use{' '}
            <code>python admin.py passwd their@address</code>; either command drops
            every live session they had.
          </p>
        </section>
      ) : (
        <p className="lede">
          Changing this list needs a super admin. Yours is an ADMIN account,
          which can do everything else in here.
        </p>
      )}

      <Confirm
        open={!!ask}
        title={ask?.active ? 'Revoke this account?' : 'Restore this account?'}
        verb={ask?.active ? 'Revoke it' : 'Restore it'}
        danger={!!ask?.active}
        busy={busy}
        onCancel={() => setAsk(null)}
        onOk={flip}
      >
        {ask?.active ? (
          <p>
            <b>{ask.email}</b> stops being able to sign in, and any session they
            have open dies on its next request. Their name stays on every decision
            they made — the account is revoked, never deleted, because the log
            points at it.
          </p>
        ) : (
          <p>
            <b>{ask?.email}</b> can sign in again with the password they had. If
            they have forgotten it, <code>python admin.py passwd</code> is how it
            changes.
          </p>
        )}
      </Confirm>
    </div>
  )
}
