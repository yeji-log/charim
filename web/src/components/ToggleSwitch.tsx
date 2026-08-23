/** 켜고 끄는 스위치. 체크박스보다 상태가 한눈에 보여서 편집 모드처럼 화면 전체의
 *  성격이 바뀌는 토글에 쓴다. */
export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: () => void
  label: string
  /** 저장이 오가는 동안 연타를 막을 때. 켜고 끈 모양은 그대로 두고 입력만 막는다. */
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-line',
        disabled ? 'cursor-not-allowed opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={[
          'inline-block size-4 rounded-full bg-surface shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
