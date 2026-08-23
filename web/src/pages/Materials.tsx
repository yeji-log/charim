import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { listCourses, listCoursesByTeacher, type CourseMeta } from '../lib/courses'
import { listTeacherPages, type TeacherPage } from '../lib/teacherPages'

/**
 * 수업자료 탭. 로그인 상태로 보이는 것이 갈린다.
 *
 * **학생** — 학교 전체 과목. 자기 선생님 주소(`/t/{슬러그}`)를 잊었을 때 돌아오는
 * 자리이기도 해서 선생님 목록을 위에 함께 띄운다. 과목만 15개쯤 늘어놓으면
 * "2학년 국어"가 셋인 상황에서 어느 게 자기 선생님 건지 구분이 안 된다.
 *
 * **교사** — 자기 수업만. 남의 과목이 섞여 있어봐야 수업 직전에 자기 것을 찾는
 * 데 방해만 된다. 선생님 목록도 빼는데, 그건 학생이 길을 찾는 장치라서다.
 * 동료 수업이 필요하면 그 선생님 공개 주소로 가면 된다.
 */
export default function Materials() {
  const { state: authState, user } = useAuth()
  const isTeacher = authState === 'teacher'
  const uid = user?.uid

  const [courses, setCourses] = useState<CourseMeta[] | null>(null)
  const [teachers, setTeachers] = useState<TeacherPage[]>([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    // 교사인지 아직 모르는 동안 전체 목록을 먼저 그리면, 확인이 끝나는 순간
    // 화면이 통째로 바뀐다. 판정을 기다렸다가 한 번만 그린다.
    if (authState === 'loading') return

    let cancelled = false
    setCourses(null)
    setLoadError(false)

    const load =
      isTeacher && uid
        ? listCoursesByTeacher(uid).then((mine) => ({ courses: mine, teachers: [] }))
        : Promise.all([listCourses(), listTeacherPages()]).then(([all, found]) => ({
            courses: all,
            teachers: found,
          }))

    load
      .then((loaded) => {
        if (cancelled) return
        setCourses(loaded.courses)
        setTeachers(loaded.teachers)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('과목 목록 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [authState, isTeacher, uid])

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        목록을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!courses) return <p className="text-muted">불러오는 중…</p>

  if (isTeacher) {
    return (
      <section>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary-dark">내 수업</h1>
          <Link
            to="/teacher"
            className="ml-auto text-sm font-semibold text-primary hover:underline"
          >
            수업 만들기·고치기
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">
          학생에게는 학교 전체 수업이 보입니다. 선생님 화면에는 내 수업만 띄웁니다.
        </p>

        {/* 아직 공개하지 않은 내 수업도 들어갈 수 있어야 한다 — 학생에게 열기
            전에 확인해보는 게 "준비 중"의 목적이다. 남의 준비 중인 과목은
            CourseGate 가 문 앞에서 막는다. */}
        <CourseGrid
          courses={courses}
          emptyText="아직 만든 수업이 없습니다."
          openUnpublished
        />
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {teachers.length > 0 && (
        <section>
          <h1 className="text-2xl font-bold tracking-tight text-primary-dark">선생님</h1>
          <p className="mt-1 text-sm text-muted">
            수업을 듣는 선생님을 고르면 그 선생님 과목만 보입니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {teachers.map((teacher) => (
              <Link
                key={teacher.slug}
                to={`/t/${teacher.slug}`}
                className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-secondary"
              >
                {teacher.displayName || teacher.slug}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold tracking-tight text-primary-dark">전체 과목</h2>
        <CourseGrid courses={courses} emptyText="아직 열린 과목이 없습니다." />
      </section>
    </div>
  )
}

/** 과목 카드 그리드. 교사 페이지(/t/{슬러그})와 이 화면이 함께 쓴다. */
export function CourseGrid({
  courses,
  emptyText,
  openUnpublished = false,
}: {
  courses: CourseMeta[]
  emptyText: string
  /** 준비 중인 과목도 눌러서 들어갈 수 있게 한다. 내 수업 목록에서만 켠다. */
  openUnpublished?: boolean
}) {
  if (courses.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
        {emptyText}
      </p>
    )
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) =>
        // 준비 중인 과목은 이름만 보이고 들어갈 수 없다. 아예 감추지 않는 건
        // "곧 열린다"를 학생이 알 수 있게 하려는 것이다.
        course.published || openUnpublished ? (
          <Link
            key={course.id}
            to={`/materials/${course.id}`}
            className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-secondary"
          >
            <h3 className="text-lg font-bold text-text">{course.name}</h3>
            <p className="mt-1.5 text-sm text-muted">
              {!course.published
                ? '준비 중 — 학생에게는 아직 안 보입니다'
                : course.pinRequired
                  ? '핀번호가 필요합니다'
                  : '바로 열람할 수 있습니다'}
            </p>
          </Link>
        ) : (
          <div
            key={course.id}
            className="rounded-2xl border border-dashed border-line p-6 opacity-70"
          >
            <h3 className="text-lg font-bold text-muted">{course.name}</h3>
            <p className="mt-1.5 text-sm text-muted">준비 중입니다</p>
          </div>
        ),
      )}
    </div>
  )
}
