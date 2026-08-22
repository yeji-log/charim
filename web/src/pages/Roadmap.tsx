import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { useLessonScope } from '../lib/lessonScope'
import { listActivities, listSeasons, type Activity, type Season } from '../lib/lessons'

const STATUS_STYLE: Record<Season['status'], string> = {
  진행중: 'bg-success/15 text-success',
  준비중: 'bg-warning/15 text-warning',
  완료: 'bg-primary-tint text-primary-dark',
}

/**
 * 수업목차(과목) / 시즌(동아리) 카드 그리드.
 *
 * 같은 컴포넌트가 두 경로에 마운트된다 — useLessonScope 가 어느 맥락인지
 * 알려준다(lessonScope.ts).
 */
export default function Roadmap() {
  const scope = useLessonScope()
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'

  const [seasons, setSeasons] = useState<Season[] | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      listSeasons(scope.courseId ? { courseId: scope.courseId } : undefined),
      listActivities({
        courseId: scope.courseId,
        publishedOnly: !isTeacher,
        includePreparingSeason: isTeacher,
      }),
    ])
      .then(([loadedSeasons, loadedActivities]) => {
        if (cancelled) return
        // 준비 중인 시즌은 학생에게 숨긴다 — 카드가 보이는데 들어가면 빈
        // 목록이 나오는 것보다 아예 안 보이는 편이 낫다.
        setSeasons(isTeacher ? loadedSeasons : loadedSeasons.filter((s) => s.status !== '준비중'))
        setActivities(loadedActivities)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('수업목차 불러오기 실패', caught)
        setSeasons([])
      })

    return () => {
      cancelled = true
    }
  }, [scope.courseId, isTeacher])

  if (!seasons) return <p className="text-muted">불러오는 중…</p>

  if (seasons.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
        아직 {scope.seasonNoun}이(가) 없습니다.
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {seasons.map((season) => {
        const count = activities.filter((activity) => activity.seasonId === season.id).length
        return (
          <Link
            key={season.id}
            to={`${scope.activitiesPath}?season=${season.id}`}
            className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-secondary"
          >
            <div className="flex items-center gap-2">
              {season.emoji && <span className="text-xl">{season.emoji}</span>}
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[season.status]}`}
              >
                {season.status}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-bold text-text">{season.title}</h3>
            {season.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{season.description}</p>
            )}
            <p className="mt-3 text-xs text-muted">
              {scope.activityNoun} {count}개
            </p>
          </Link>
        )
      })}
    </div>
  )
}
