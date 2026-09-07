import { useState } from 'react'
import { adm, type Who } from '../api'

/** The only way in.

    There is no "create an account" link and there is no route behind one. The
    first operator comes from a shell (`python admin.py add you@example.com`)
    and every one after that from a super admin inside the panel -- so this
    screen has nothing to offer somebody who does not already have an account,
    and says so rather than leaving them looking for the link.

    Password success returns a five-minute opaque challenge, not a session. The
    session is issued only after the authenticator code, and then lives in an
    httpOnly cookie this app cannot read. */
export default function Login({ onIn }: { onIn: (who: Who) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      if (challenge) {
        onIn(await adm.loginTotp(challenge, code))
      } else {
        const next = await adm.login(email.trim(), password)
        setChallenge(next.challenge)
        setPassword('')
      }
    } catch (x) {
      setErr((x as Error).message)
      if (challenge) setCode('')
      else setPassword('')
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
          {challenge
            ? 'Enter the current code from your authenticator app.'
            : 'Accounts and authenticator keys are made from the server, not here.'}
        </p>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        {challenge ? (
          <div className="field">
            <label htmlFor="ad-code">Authentication code</label>
            <input
              id="ad-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              required
            />
          </div>
        ) : (
          <>
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
          </>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Checking…' : challenge ? 'Verify and sign in' : 'Continue'}
        </button>
        {challenge && (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => { setChallenge(''); setCode(''); setErr('') }}
          >
            Use another account
          </button>
        )}
      </form>
    </div>
  )
}
