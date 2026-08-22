import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { getCourse, type CourseMeta } from '../lib/courses'
import { usePinAttemptThrottle } from '../lib/pinThrottle'

/**
 * 과목 게이트.
 *
 * 핀 검사를 **부모 라우트**에 두는 게 이 구조의 핵심이다. 화면마다 검사를
 * 넣으면 `/materials/{id}/content` 처럼 자식 경로로 직접 들어왔을 때 건너뛸
 * 수 있는데, 부모가 <Outlet/> 을 열고 닫으면 그런 구멍이 없다. 자료 탭과
 * 수업내용 탭을 오가도 핀을 다시 묻지 않는 것도 덤이다.
 *
 * 통과 상태는 이 컴포넌트의 state 로만 들고 있다. 저장해두면 편하지만 공용
 * 컴퓨터에서 다음 학생이 그대로 들어가게 되므로 새로고침하면 다시 묻는다.
 */
interface CourseContext {
  course: CourseMeta
}

export function useCourse(): CourseContext {
  return useOutletContext<CourseContext>()
}

export default function CourseGate() {
  const { courseId } = useParams<{ courseId: string }>()
  const { state: authState } = useAuth()
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

  // 담당 교사는 준비 중인 과목도 미리 본다 — 자료를 올려두고 정리하는 동안
  // 학생 화면이 어떻게 보이는지 확인해야 한다.
  const isOwner = authState === 'teacher'

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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      {children}
    </div>
  )
}
