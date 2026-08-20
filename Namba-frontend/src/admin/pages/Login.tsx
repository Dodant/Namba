import { useState } from 'react'
import { adm, type Who } from '../api'

/** The only way in.

    There is no "create an account" link and there is no route behind one. The
    first operator comes from a shell (`python admin.py add you@example.com`)
    and every one after that from a super admin inside the panel -- so this
    screen has nothing to offer somebody who does not already have an account,
    and says so rather than leaving them looking for the link.

    The password field is `type="password"` and nothing here remembers it: the
    session is an httpOnly cookie the server sets, so the app never holds a
    credential of any kind after this form is submitted. */
export default function Login({ onIn }: { onIn: (who: Who) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      onIn(await adm.login(email.trim(), password))
    } catch (x) {
      setErr((x as Error).message)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <form onSubmit={submit}>
        <h1>
          Na<span>mb</span>a · back office
        </h1>
        <p className="lede">
          For whoever runs the wiki. Accounts are made from the server, not from
          here.
        </p>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div className="field">
          <label htmlFor="ad-email">Email</label>
          <input
            id="ad-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="ad-pw">Password</label>
          <input
            id="ad-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
          />
        </div>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
