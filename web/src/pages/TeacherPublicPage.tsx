import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { CourseGrid } from './Materials'
import { listCoursesByTeacher, type CourseMeta } from '../lib/courses'
import { getTeacherPageBySlug, type TeacherPage } from '../lib/teacherPages'

/**
 * 교사 공개 페이지 — `/t/{슬러그}`.
 *
 * 교사가 수업 첫날 칠판에 적는 주소 한 줄이 여기로 온다. 학교 전체 과목이
 * 섞인 `/materials` 와 달리 그 선생님 과목만 보이므로, 학생이 "2학년 국어"가
 * 셋인 목록에서 자기 것을 찾을 필요가 없다.
 *
 * 로그인이 필요 없다. 과목 상세로 들어갈 때 과목 핀이 걸린다.
 */
export default function TeacherPublicPage() {
  const { slug } = useParams<{ slug: string }>()
  const [page, setPage] = useState<TeacherPage | null>(null)
  const [courses, setCourses] = useState<CourseMeta[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setStatus('loading')

    getTeacherPageBySlug(slug)
      .then(async (found) => {
        if (cancelled) return
        if (!found) {
          setStatus('missing')
          return
        }
        setPage(found)
        setCourses(await listCoursesByTeacher(found.uid))
        if (!cancelled) setStatus('ready')
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('교사 페이지 불러오기 실패', caught)
        setStatus('missing')
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (status === 'loading') return <p className="text-muted">불러오는 중…</p>

  if (status === 'missing' || !page) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
        <h1 className="text-xl font-bold text-text">이 주소의 선생님을 찾을 수 없습니다</h1>
        <p className="text-sm leading-relaxed text-muted">
          주소를 다시 확인해 주세요. 선생님이 주소를 바꾸셨을 수도 있습니다.
        </p>
        <Link to="/materials" className="text-sm font-semibold text-primary underline">
          선생님 목록에서 찾기
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-primary-dark">
        {page.displayName || page.slug}
      </h1>
      <p className="text-sm text-muted">수업을 고르면 자료와 수업 내용을 볼 수 있습니다.</p>

      <CourseGrid courses={courses} emptyText="아직 열린 수업이 없습니다." />
    </div>
  )
}
