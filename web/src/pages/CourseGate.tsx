import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import TeacherPinBadge from '../components/TeacherPinBadge'
import { getCourse, type CourseMeta } from '../lib/courses'
import { usePinAttemptThrottle } from '../lib/pinThrottle'
import { isPinUnlocked, markPinUnlocked } from '../lib/pinUnlock'

/**
 * 과목 게이트.
 *
 * 핀 검사를 **부모 라우트**에 두는 게 이 구조의 핵심이다. 화면마다 검사를
 * 넣으면 `/materials/{id}/content` 처럼 자식 경로로 직접 들어왔을 때 건너뛸
 * 수 있는데, 부모가 <Outlet/> 을 열고 닫으면 그런 구멍이 없다. 자료 탭과
 * 수업내용 탭을 오가도 핀을 다시 묻지 않는 것도 덤이다.
 *
 * 통과 상태는 sessionStorage 에 남긴다 — 새로고침이나 자료를 열었다 돌아오는
 * 것만으로 핀을 다시 묻지 않게. 탭을 닫으면 사라지므로 공용 컴퓨터에서 다음
 * 학생은 다시 입력해야 한다. 자세한 이유는 `lib/pinUnlock.ts`.
 */
interface CourseContext {
  course: CourseMeta
}

export function useCourse(): CourseContext {
  return useOutletContext<CourseContext>()
}

export default function CourseGate() {
  const { courseId } = useParams<{ courseId: string }>()
  const { state: authState, user } = useAuth()
  const [course, setCourse] = useState<CourseMeta | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    setStatus('loading')
    setUnlocked(false)

    getCourse(courseId)
      .then((found) => {
        if (cancelled) return
        setCourse(found)
        setStatus(found ? 'ready' : 'missing')
        // 이 세션에서 이미 통과한 과목이면 다시 묻지 않는다. 과목을 불러온
        // 뒤라야 지금 핀과 저장된 핀이 같은지 볼 수 있어서 여기서 정한다.
        if (found) setUnlocked(isPinUnlocked(`course:${found.id}`, found.pin))
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('과목 불러오기 실패', caught)
        setStatus('missing')
      })

    return () => {
      cancelled = true
    }
  }, [courseId])

  if (status === 'loading') return <p className="text-muted">불러오는 중…</p>

  if (status === 'missing' || !course) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-text">과목을 찾을 수 없습니다</h1>
        <Link to="/materials" className="text-sm font-semibold text-primary underline">
          과목 목록으로
        </Link>
      </Centered>
    )
  }

  // 담당 교사는 준비 중인 과목도 미리 보고 핀도 건너뛴다 — 자료를 올려두고
  // 정리하는 동안 학생 화면이 어떻게 보이는지 확인해야 한다.
  //
  // **"로그인한 교사"가 아니라 "이 과목의 담당 교사"다.** 예전에는 로그인만
  // 하면 누구든 통과했는데, 그러면 옆 반 선생님이 남의 과목을 준비 중인
  // 상태까지 그대로 들여다본다. 다른 교사는 학생과 똑같이 다룬다.
  const isOwner = authState === 'teacher' && !!user && course.ownerUid === user.uid

  if (!course.published && !isOwner) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-text">{course.name}</h1>
        <p className="text-sm text-muted">아직 준비 중인 과목입니다.</p>
        <Link to="/materials" className="text-sm font-semibold text-primary underline">
          과목 목록으로
        </Link>
      </Centered>
    )
  }

  const needsPin = course.pinRequired && !unlocked && !isOwner

  if (needsPin) {
    return <PinGate course={course} onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm text-muted">
            <Link to="/materials" className="hover:text-text">
              수업자료
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-primary-dark">{course.name}</h1>
        </div>

        {/* 교사에게만 보이는 핀 배지. 수업 중에 "핀번호 뭐예요?"가 나왔을 때
            교사 화면까지 되돌아가지 않고 여기서 바로 읽어줄 수 있다. 학생에게는
            보이지 않는다 — 담당 교사로 로그인해야만 isOwner 가 참이 된다. */}
        {isOwner && <TeacherPinBadge pinRequired={course.pinRequired} pin={course.pin} />}

        {course.notionUrl && (
          <a
            href={course.notionUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
          >
            수업 노트 열기 ↗
          </a>
        )}
      </header>

      {!course.published && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-text">
          준비 중인 과목입니다. 학생에게는 아직 보이지 않습니다.
        </p>
      )}

      {/* 학생이 과목에 들어오면 자료보다 수업목차부터 보게 한다 — 그래서
          수업목차가 index 라우트다(main.tsx). */}
      <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-line pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <CourseTab to={`/materials/${course.id}`} end>
          수업목차
        </CourseTab>
        <CourseTab to={`/materials/${course.id}/content`}>수업 내용</CourseTab>
        <CourseTab to={`/materials/${course.id}/materials`}>자료</CourseTab>
      </nav>

      <Outlet context={{ course } satisfies CourseContext} />
    </div>
  )
}

function PinGate({ course, onUnlock }: { course: CourseMeta; onUnlock: () => void }) {
  // 게이트마다 저장 키를 나눈다 — 한 과목에서 틀렸다고 다른 과목까지 잠기면 안 된다.
  const throttle = usePinAttemptThrottle(`course:${course.id}`)
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      if (throttle.isLocked || throttle.isBusy) return

      if (value.trim() === course.pin.trim()) {
        throttle.reset()
        markPinUnlocked(`course:${course.id}`, course.pin)
        onUnlock()
        return
      }
      setWrong(true)
      throttle.recordFailure()
    },
    [value, course.pin, throttle, onUnlock],
  )

  return (
    <Centered>
      <h1 className="text-xl font-bold text-text">{course.name}</h1>
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

      <Link to="/materials" className="text-sm text-muted underline hover:text-text">
        과목 목록으로
      </Link>
    </Centered>
  )
}

function CourseTab({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
          isActive ? 'bg-primary-tint text-primary-dark' : 'text-muted hover:text-text',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      {children}
    </div>
  )
}
