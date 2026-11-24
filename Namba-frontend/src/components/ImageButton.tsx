import { useState } from 'react'
import { api, errorText } from '../api'
import { useUi } from '../uiLocale'

/* A picture, as one round button at the far end of the row it belongs to:
   beside an entry's title, and beside each name of an Origins link. It picks
   and uploads, and once there is a picture it shows it and takes it away
   again on a press. No label over it -- the tip says what it is.

   `onBusy` is for a form that must not publish mid-upload, and `onBroken`
   for one that can be handed a path whose file is gone: a recovered draft. */
export function ImageButton({ id, value, onChange, onError, onBusy, onBroken }: {
  id: string
  value: string | null
  onChange: (url: string | null) => void
  onError: (msg: string) => void
  onBusy?: (busy: boolean) => void
  onBroken?: () => void
}) {
  const { m } = useUi()
  const [busy, setBusy] = useState(false)
  return (
    /* data-tip and not title: the button has no label over it, so what it is
       has to arrive as soon as it is pointed at, not after the browser's wait */
    <div className="field og-img" data-tip={value ? m.form.remove : `${m.form.image} · ${m.form.imageHint}`}>
      {value ? (
        <button type="button" id={id} className="og-pic"
                aria-label={m.form.remove} onClick={() => onChange(null)}>
          <img src={value} alt="" decoding="async" onError={onBroken} />
        </button>
      ) : (
        <label className={`og-pic ${busy ? 'busy' : ''}`}>
          {busy ? <span aria-hidden="true">…</span> : (
            /* a framed picture: a sun over a hill, the sign for "image" */
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="8.5" cy="9.5" r="1.6" />
              <path d="M21 16l-5-5-9 9" />
            </svg>
          )}
          <input
            id={id}
            aria-label={m.form.image}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setBusy(true)
              onBusy?.(true)
              try {
                onChange((await api.upload(file)).url)
              } catch (err) {
                onError(errorText(err))
              } finally {
                setBusy(false)
                onBusy?.(false)
              }
            }}
          />
        </label>
      )}
    </div>
  )
}
