import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { listCourses, type CourseMeta } from '../lib/courses'
import { listTeacherPages, type TeacherPage } from '../lib/teacherPages'

/**
 * 학교 전체 과목 목록.
 *
 * 학생이 자기 선생님 주소(`/t/{슬러그}`)를 잊었을 때 돌아오는 자리이기도 해서
 * 선생님 목록을 위에 함께 띄운다. 과목만 15개쯤 늘어놓으면 "2학년 국어"가 셋인
 * 상황에서 어느 게 자기 선생님 건지 구분이 안 된다.
 */
export default function Materials() {
  const [courses, setCourses] = useState<CourseMeta[] | null>(null)
  const [teachers, setTeachers] = useState<TeacherPage[]>([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([listCourses(), listTeacherPages()])
      .then(([loadedCourses, loadedTeachers]) => {
        if (cancelled) return
        setCourses(loadedCourses)
        setTeachers(loadedTeachers)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('과목 목록 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        목록을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!courses) return <p className="text-muted">불러오는 중…</p>

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
}: {
  courses: CourseMeta[]
  emptyText: string
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
        course.published ? (
          <Link
            key={course.id}
            to={`/materials/${course.id}`}
            className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-secondary"
          >
            <h3 className="text-lg font-bold text-text">{course.name}</h3>
            <p className="mt-1.5 text-sm text-muted">
              {course.pinRequired ? '핀번호가 필요합니다' : '바로 열람할 수 있습니다'}
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
