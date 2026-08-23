import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { usePinAttemptThrottle } from '../lib/pinThrottle'
import { markPinUnlocked } from '../lib/pinUnlock'

/**
 * 핀번호 입력 화면. 과목 게이트와 동아리 게이트가 함께 쓴다.
 *
 * 원래 두 곳에 같은 코드가 복붙돼 있었다. 동아리가 여러 개가 되면서 게이트도
 * 과목과 같은 모양이 됐는데, 그대로 두면 감속 규칙이나 문구를 고칠 때 한쪽만
 * 고치게 된다.
 *
 * `storageKey` 는 게이트마다 반드시 달라야 한다 — 한 과목에서 통과했다고 다른
 * 과목까지 열리면 안 되고, 한 곳에서 틀렸다고 다른 곳까지 잠기면 안 된다.
 * 통과 기록과 오입력 횟수 양쪽의 키로 쓰인다.
 */
export default function PinGate({
  title,
  pin,
  storageKey,
  backTo,
  backLabel,
  onUnlock,
}: {
  title: string
  pin: string
  storageKey: string
  backTo: string
  backLabel: string
  onUnlock: () => void
}) {
  const throttle = usePinAttemptThrottle(storageKey)
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      if (throttle.isLocked || throttle.isBusy) return

      if (value.trim() === pin.trim()) {
        throttle.reset()
        markPinUnlocked(storageKey, pin)
        onUnlock()
        return
      }
      setWrong(true)
      throttle.recordFailure()
    },
    [value, pin, storageKey, throttle, onUnlock],
  )

  return (
    <GateShell>
      <h1 className="text-xl font-bold text-text">{title}</h1>
      <p className="text-sm text-muted">선생님이 알려준 핀번호를 입력해 주세요.</p>

      <form onSubmit={submit} className="mt-2 flex flex-col items-center gap-3">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setWrong(false)
          }}
          disabled={throttle.isLocked}
          autoFocus
          // 숫자 핀이 많아 모바일에서 숫자 키패드가 뜨는 편이 빠르다. 문자를
          // 섞은 핀도 쓸 수 있어야 하므로 type="number" 는 쓰지 않는다.
          inputMode="numeric"
          autoComplete="off"
          placeholder="핀번호"
          className="w-40 rounded-lg border border-line bg-surface px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:border-secondary disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={throttle.isLocked || throttle.isBusy}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          들어가기
        </button>
      </form>

      {throttle.isLocked ? (
        <p className="text-sm text-error">
          너무 여러 번 틀렸습니다. {throttle.remainingSeconds}초 뒤에 다시 시도해 주세요.
        </p>
      ) : (
        wrong && <p className="text-sm text-error">핀번호가 맞지 않습니다.</p>
      )}

      <Link to={backTo} className="text-sm text-muted underline hover:text-text">
        {backLabel}
      </Link>
    </GateShell>
  )
}

/** 게이트 화면들의 공통 껍데기 — "찾을 수 없습니다", "준비 중입니다"도 이걸 쓴다. */
export function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      {children}
    </div>
  )
}
