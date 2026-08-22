import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { useLessonScope } from '../lib/lessonScope'
import { listActivities, listSeasons, type Activity, type Season } from '../lib/lessons'

/** 수업 내용(과목) / 활동(동아리) 목록. 시즌으로 걸러 볼 수 있다. */
export default function ActivityList() {
  const scope = useLessonScope()
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'

  const [params, setParams] = useSearchParams()
  const seasonId = params.get('season') ?? ''

  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      listActivities({
        courseId: scope.courseId,
        seasonId: seasonId || undefined,
        publishedOnly: !isTeacher,
        includePreparingSeason: isTeacher,
      }),
      listSeasons(scope.courseId ? { courseId: scope.courseId } : undefined),
    ])
      .then(([loadedActivities, loadedSeasons]) => {
        if (cancelled) return
        setActivities(loadedActivities)
        setSeasons(loadedSeasons)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('수업 내용 불러오기 실패', caught)
        setActivities([])
      })

    return () => {
      cancelled = true
    }
  }, [scope.courseId, seasonId, isTeacher])

  const seasonTitle = (id: string) => seasons.find((season) => season.id === id)?.title ?? ''

  return (
    <div className="flex flex-col gap-4">
      {seasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip active={!seasonId} onClick={() => setParams({})}>
            전체
          </FilterChip>
          {seasons.map((season) => (
            <FilterChip
              key={season.id}
              active={seasonId === season.id}
              onClick={() => setParams({ season: season.id })}
            >
              {season.emoji} {season.title}
            </FilterChip>
          ))}
        </div>
      )}

      {!activities ? (
        <p className="text-muted">불러오는 중…</p>
      ) : activities.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          아직 {scope.activityNoun}이(가) 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                to={scope.activityDetailPath(activity.id)}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-secondary"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-text">{activity.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {activity.seasonId && seasonTitle(activity.seasonId)}
                    {activity.seasonId && ' · '}
                    항목 {activity.sections.length}개
                  </p>
                </div>
                {!activity.published && (
                  <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                    준비 중
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
        active
          ? 'border-primary bg-primary-tint text-primary-dark'
          : 'border-line bg-surface text-muted hover:border-secondary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
