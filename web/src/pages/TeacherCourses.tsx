import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { createCourse, listCoursesByTeacher, type CourseMeta } from '../lib/courses'

const ghostButton =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'
const inputClass =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary'

/**
 * 교사 페이지의 과목 목록.
 *
 * 편집은 모달이 아니라 `/teacher/course/{id}` 화면에서 한다 — 모달 안에서 활동
 * 편집 모달이 또 열려 모바일에서 두 겹이 쌓였다(TeacherCourseEdit.tsx 참고).
 * 여기는 목록과 만들기만 맡는다.
 */
export default function TeacherCourses() {
  const { user } = useAuth()
  const uid = user?.uid

  const [courses, setCourses] = useState<CourseMeta[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false

    listCoursesByTeacher(uid)
      .then((loaded) => {
        if (!cancelled) setCourses(loaded)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('과목 목록 불러오기 실패', caught)
        setCourses([])
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!uid || !name.trim() || !courses) return
    setBusy(true)
    try {
      const created = await createCourse(uid, name)
      setCourses([...courses, created])
      setName('')
    } catch (caught) {
      console.error('과목 만들기 실패', caught)
    } finally {
      setBusy(false)
    }
  }

  if (!courses || !uid) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-sm text-muted">불러오는 중…</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-bold text-text">내 과목</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        여기서 만든 과목이 학생에게 보입니다. 준비가 끝나면 공개로 바꿔 주세요.
      </p>

      {courses.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {courses.map((course) => (
            <li key={course.id}>
              {/* 카드 전체를 링크로 둔다 — 모바일에서 작은 "열기" 버튼을 겨냥해
                  누르는 것보다 넓은 과녁이 낫다. */}
              <Link
                to={`/teacher/course/${course.id}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-4 py-3 transition-colors hover:border-secondary"
              >
                <span className="font-bold text-text">{course.name}</span>

                <span
                  className={[
                    'rounded-md px-2 py-0.5 text-xs font-semibold',
                    course.published ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
                  ].join(' ')}
                >
                  {course.published ? '공개' : '준비 중'}
                </span>

                {course.pinRequired && (
                  <span className="rounded-md bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary-dark">
                    핀 {course.pin || '(미설정)'}
                  </span>
                )}

                <span className="ml-auto text-sm font-semibold text-muted">열기 →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 2학년 국어"
          className={inputClass + ' min-w-0 flex-1 sm:max-w-48 sm:flex-none'}
        />
        <button type="submit" disabled={busy} className={primaryButton}>
          과목 추가
        </button>
      </form>

      {courses.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          아직 과목이 없습니다. 위에 이름을 넣고 만들어 보세요.
        </p>
      )}

      <p className="mt-4 text-xs text-muted">
        학생에게 보이는 화면은 각 과목의 <span className={ghostButton + ' px-1.5 py-0.5'}>학생
        화면으로</span> 에서 확인할 수 있습니다.
      </p>
    </section>
  )
}
