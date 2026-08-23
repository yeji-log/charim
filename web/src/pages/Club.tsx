import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import TeacherPinBadge from '../components/TeacherPinBadge'
import { getClubSettings, listActivities, type Activity, type ClubSettings } from '../lib/lessons'
import { usePinAttemptThrottle } from '../lib/pinThrottle'
import { isPinUnlocked, markPinUnlocked } from '../lib/pinUnlock'

/**
 * 동아리 게이트 + 레이아웃.
 *
 * 과목 게이트(CourseGate)와 같은 패턴이다 — 핀 검사를 부모 라우트에 두고
 * <Outlet/> 을 열어야 `/club/activities` 로 직접 들어와도 건너뛸 수 없다.
 * 통과 사실을 sessionStorage 에 남겨 새로고침해도 다시 묻지 않는 것까지 같다
 * (`lib/pinUnlock.ts`).
 */
export default function Club() {
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'

  const [settings, setSettings] = useState<ClubSettings | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    getClubSettings()
      .then((loaded) => {
        setSettings(loaded)
        // 이 세션에서 이미 통과했으면 다시 묻지 않는다. 저장된 값과 지금 핀이
        // 같아야 통과로 치므로, 교사가 핀을 바꾸면 자연히 다시 묻는다.
        setUnlocked(isPinUnlocked('club', loaded.pin))
      })
      .catch((caught) => {
        console.error('동아리 설정 불러오기 실패', caught)
        setSettings(null)
      })
  }, [])

  if (!settings) return <p className="text-muted">불러오는 중…</p>

  if (settings.pinRequired && !unlocked && !isTeacher) {
    return <ClubPinGate pin={settings.pin} onUnlock={() => setUnlocked(true)} />
  }

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    [
      'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
      isActive ? 'bg-primary-tint text-primary-dark' : 'text-muted hover:text-text',
    ].join(' ')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark">동아리</h1>
        {/* 교사에게만 보이는 핀 배지 — CourseGate 와 같다. */}
        {isTeacher && <TeacherPinBadge pinRequired={settings.pinRequired} pin={settings.pin} />}
      </header>

      <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-line pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavLink to="/club" end className={tabClass}>
          홈
        </NavLink>
        <NavLink to="/club/seasons" className={tabClass}>
          시즌
        </NavLink>
        <NavLink to="/club/activities" className={tabClass}>
          활동
        </NavLink>
      </nav>

      <Outlet />
    </div>
  )
}

/** 동아리 홈 — 오늘의 미션과 추천 활동. */
export function ClubHome() {
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'

  const [settings, setSettings] = useState<ClubSettings | null>(null)
  const [featured, setFeatured] = useState<Activity[]>([])

  useEffect(() => {
    let cancelled = false

    getClubSettings()
      .then(async (loaded) => {
        if (cancelled) return
        setSettings(loaded)
        if (loaded.featuredActivityIds.length === 0) return
        const all = await listActivities({ publishedOnly: !isTeacher })
        if (!cancelled) {
          setFeatured(all.filter((a) => loaded.featuredActivityIds.includes(a.id)))
        }
      })
      .catch((caught) => console.error('동아리 홈 불러오기 실패', caught))

    return () => {
      cancelled = true
    }
  }, [isTeacher])

  if (!settings) return <p className="text-muted">불러오는 중…</p>

  const empty = !settings.todayMissionText.trim() && featured.length === 0

  if (empty) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm leading-relaxed text-muted">
        아직 동아리 홈에 올려둔 것이 없습니다.
        <br />
        시즌과 활동 탭에서 내용을 볼 수 있습니다.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {settings.todayMissionText.trim() && (
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-sm font-bold text-muted">오늘의 미션</h2>
          <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-text">
            {settings.todayMissionText}
          </p>
        </section>
      )}

      {featured.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-muted">이어서 할 활동</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {featured.map((activity) => (
              <li key={activity.id}>
                <Link
                  to={`/club/activities/${activity.id}`}
                  className="block rounded-2xl border border-line bg-surface p-5 font-bold text-text transition-colors hover:border-secondary"
                >
                  {activity.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ClubPinGate({ pin, onUnlock }: { pin: string; onUnlock: () => void }) {
  const throttle = usePinAttemptThrottle('club')
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      if (throttle.isLocked || throttle.isBusy) return

      if (value.trim() === pin.trim()) {
        throttle.reset()
        markPinUnlocked('club', pin)
        onUnlock()
        return
      }
      setWrong(true)
      throttle.recordFailure()
    },
    [value, pin, throttle, onUnlock],
  )

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      <h1 className="text-xl font-bold text-text">동아리</h1>
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
    </div>
  )
}
