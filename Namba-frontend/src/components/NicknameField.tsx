import { nickname } from '../api'
import { useUi } from '../uiLocale'

export function NicknameField({
  id,
  value,
  onChange,
  label,
  hint,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  label: string
  hint?: string
}) {
  const { m } = useUi()

  return (
    <div className="field nick-field">
      <label htmlFor={id}>
        {label}{' '}
        {hint && <span className="hint">{hint}</span>}
      </label>
      <div className="nick-control">
        <input
          id={id}
          maxLength={40}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={m.common.nicknamePlaceholder}
          autoComplete="nickname"
          required
        />
        <button type="button" className="btn" onClick={() => onChange(nickname.draw())}>
          {m.common.drawNickname}
        </button>
      </div>
    </div>
  )
}
