import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { CharimSymbol } from '../components/Logo'
import { CopyBox } from './Teacher'
import { hasDateRecord, listClasses, todayLocal, type ClassMeta } from '../lib/classRecords'
import { getMyClub, type ClubMeta } from '../lib/clubs'
import { listCoursesByTeacher, type CourseMeta } from '../lib/courses'
import { getMyTeacherPage, listTeacherPages, type TeacherPage } from '../lib/teacherPages'
import {
  cellKey,
  classColorFor,
  getTimetable,
  isEmptyCell,
  type TimetableData,
} from '../lib/timetable'

/**
 * 홈은 두 벌이다.
 *
 * 같은 주소에서 로그인 상태로 갈린다. 교사에게는 "지금 몇 교시, 어느 반,
 * 기록은 썼나"를 먼저 보여주고, 학생에게는 "내 선생님 찾아가기"를 먼저
 * 보여준다. 두 화면이 원하는 것이 겹치지 않아서 한 벌로 합칠 수가 없다 —
 * 대신 색·글꼴·카드 모양은 공유하고 밀도만 다르게 간다(브랜딩 가이드 14절).
 */
export default function Home() {
  const { state } = useAuth()

  // 학생용을 먼저 그렸다가 교사용으로 바꾸면 교사가 매번 화면이 튀는 걸 본다.
  // 멤버 확인은 문서 한 번 읽기라 금방 끝나므로 그동안은 아무것도 정하지 않는다.
  if (state === 'loading') return <p className="text-muted">불러오는 중…</p>

  return state === 'teacher' ? <TeacherHome /> : <StudentHome />
}

/* ────────────────────────────── 교사용 ────────────────────────────── */

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

interface TodayLesson {
  period: number
  /** 교사가 자유롭게 적은 시간 표시. 비어 있을 수 있다. */
  time: string
  className: string
  subject: string
  room: string
  /** 반 색(시간표와 같은 규칙). 반 이름이 없으면 null. */
  color: string | null
}

/**
 * "09:00", "9:00~9:50", "9시 10분" 처럼 앞머리에서 시:분을 읽는다.
 *
 * `periodTimes` 는 형식을 강제하지 않기로 한 자유 텍스트다(`lib/timetable.ts`).
 * 그러니 여기서도 강제하지 않고, 읽히면 쓰고 안 읽히면 포기한다. 지금 교시를
 * 틀리게 짚는 건 아예 안 짚느니만 못하다.
 */
function startMinutesOf(raw: string | undefined): number | null {
  if (!raw) return null
  const matched = /(\d{1,2})\s*[:시]\s*(\d{1,2})?/.exec(raw)
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2] ?? 0)
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * 지금이 몇 교시인지. 시간을 하나도 안 적어둔 시간표면 null 이고, 그때는
 * 아무 교시도 강조하지 않는다.
 */
function findCurrentPeriod(
  periodTimes: Record<number, string>,
  periods: number,
  nowMinutes: number,
): number | null {
  const starts: { period: number; start: number }[] = []
  for (let period = 1; period <= periods; period += 1) {
    const start = startMinutesOf(periodTimes[period])
    if (start !== null) starts.push({ period, start })
  }
  starts.sort((a, b) => a.start - b.start)

  for (let index = 0; index < starts.length; index += 1) {
    const { period, start } = starts[index]
    if (nowMinutes < start) continue
    const next = starts[index + 1]
    // 다음 교시가 시작하기 전까지를 이 교시로 본다. 마지막 교시는 끝 시각을
    // 알 길이 없어서 90분만 인정한다 — 밤 열한 시에 7교시가 "지금"으로 남아
    // 있으면 안 된다.
    const end = next ? next.start : start + 90
    if (nowMinutes < end) return period
  }
  return null
}

function greetingFor(hour: number): string {
  if (hour < 11) return '좋은 아침입니다'
  if (hour < 17) return '안녕하세요'
  return '오늘 하루 수고하셨습니다'
}

function TeacherHome() {
  const { user } = useAuth()
  const uid = user?.uid

  // 교사는 이 탭을 종일 열어둔다. 시계를 한 번만 읽으면 오후에도 아침 인사가
  // 떠 있고 "지금 교시"가 1교시에 멈춘다. 1분마다 다시 읽는다 — 서버 호출이
  // 아니라 렌더만 다시 하는 것이라 비용이 없다.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const [timetable, setTimetable] = useState<TimetableData | null>(null)
  const [courses, setCourses] = useState<CourseMeta[]>([])
  const [myPage, setMyPage] = useState<TeacherPage | null>(null)
  const [myClub, setMyClub] = useState<ClubMeta | null>(null)
  const [classes, setClasses] = useState<ClassMeta[]>([])
  const [loadError, setLoadError] = useState(false)
  /** 반 id -> 오늘 기록 문서가 있는지. 아직 확인 전이면 키가 없다. */
  const [recorded, setRecorded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!uid) return
    let cancelled = false

    Promise.all([
      getTimetable(uid),
      listCoursesByTeacher(uid),
      getMyTeacherPage(uid),
      listClasses(uid),
      // 동아리는 문서 id 가 곧 uid 라 질의 없이 하나 읽으면 된다.
      getMyClub(uid),
    ])
      .then(([loadedTimetable, loadedCourses, loadedPage, loadedClasses, loadedClub]) => {
        if (cancelled) return
        setTimetable(loadedTimetable)
        setCourses(loadedCourses)
        setMyPage(loadedPage)
        setClasses(loadedClasses)
        setMyClub(loadedClub)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('홈 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  const jsDay = now.getDay()
  const isWeekend = jsDay === 0 || jsDay === 6
  // 시간표는 월~금뿐이다. 주말에는 다가오는 월요일을 대신 보여준다 —
  // 일요일 저녁에 내일 수업을 확인하는 게 실제 쓰임새다.
  const dayIndex = isWeekend ? 0 : jsDay - 1
  const today = todayLocal()

  const lessons = useMemo<TodayLesson[]>(() => {
    if (!timetable) return []
    const out: TodayLesson[] = []
    for (let period = 1; period <= timetable.periods; period += 1) {
      const cell = timetable.cells[cellKey(dayIndex, period)]
      if (isEmptyCell(cell)) continue
      const className = cell!.className.trim()
      out.push({
        period,
        time: (timetable.periodTimes[period] ?? '').trim(),
        className,
        subject: cell!.subject.trim(),
        room: cell!.room.trim(),
        color: className ? classColorFor(timetable, className) : null,
      })
    }
    return out
  }, [timetable, dayIndex])

  const currentPeriod = useMemo(() => {
    if (!timetable || isWeekend) return null
    return findCurrentPeriod(
      timetable.periodTimes,
      timetable.periods,
      now.getHours() * 60 + now.getMinutes(),
    )
  }, [timetable, isWeekend, now])

  /**
   * 시간표의 반 이름과 명단의 반 이름을 글자로 맞춘다.
   *
   * 두 곳을 id 로 잇지 않은 건 시간표가 명단보다 먼저 채워지기 때문이다 —
   * 학기 초에 시간표부터 적고 명단은 나중에 만든다. 이름이 어긋나면 기록
   * 상태만 안 뜨고 나머지는 그대로 보인다. 조용히 틀린 반에 붙는 것보다
   * 아무것도 안 붙는 편이 안전하다.
   */
  const classByName = useMemo(
    () => new Map(classes.map((entry) => [entry.name.trim(), entry])),
    [classes],
  )

  const todayClassIds = useMemo(() => {
    if (isWeekend) return [] as string[]
    const ids = new Set<string>()
    for (const lesson of lessons) {
      const matched = lesson.className ? classByName.get(lesson.className) : undefined
      if (matched) ids.add(matched.id)
    }
    return [...ids]
  }, [lessons, classByName, isWeekend])

  // 반 이름 목록이 실제로 바뀔 때만 다시 묻도록 문자열로 굳혀서 의존성에 쓴다
  // (배열은 렌더마다 새 객체라 그대로 넣으면 1분마다 다시 읽는다).
  const todayClassKey = todayClassIds.join(',')

  useEffect(() => {
    if (!uid || !todayClassKey) return
    let cancelled = false

    Promise.all(
      todayClassKey
        .split(',')
        .map(async (classId) => [classId, await hasDateRecord(uid, classId, today)] as const),
    )
      .then((entries) => {
        if (!cancelled) setRecorded(Object.fromEntries(entries))
      })
      .catch((caught) => {
        // 기록 상태는 곁다리 정보다. 못 읽어도 오늘의 수업은 그대로 보여준다.
        console.error('오늘 기록 확인 실패', caught)
      })

    return () => {
      cancelled = true
    }
  }, [uid, todayClassKey, today])

  const missingCount = todayClassIds.filter((id) => recorded[id] === false).length

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        홈을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark sm:text-3xl">
          {greetingFor(now.getHours())}
          {user?.displayName ? `, ${user.displayName} 선생님` : ', 선생님'}.
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {now.getMonth() + 1}월 {now.getDate()}일 {WEEKDAY_LABELS[jsDay]}요일
          {!isWeekend && lessons.length > 0 && ` · 오늘 ${lessons.length}교시 수업이 있습니다`}
        </p>
      </header>

      <section>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-bold text-text">
            {isWeekend ? '다가오는 월요일' : '오늘의 수업'}
          </h2>
          {missingCount > 0 && (
            <span className="text-sm text-warning">
              기록이 남지 않은 반이 {missingCount}개 있습니다
            </span>
          )}
          <Link
            to="/schedule"
            className="ml-auto text-sm font-semibold text-primary hover:underline"
          >
            시간표 전체 보기
          </Link>
        </div>

        {!timetable ? (
          <p className="mt-3 text-sm text-muted">불러오는 중…</p>
        ) : lessons.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            {isWeekend ? '월요일' : '오늘'} 시간표에 적어둔 수업이 없습니다.{' '}
            <Link to="/schedule" className="font-semibold text-primary underline">
              시간표 채우기
            </Link>
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {lessons.map((lesson) => {
              const matched = lesson.className ? classByName.get(lesson.className) : undefined
              const isNow = !isWeekend && lesson.period === currentPeriod

              return (
                <li
                  key={lesson.period}
                  className={[
                    'flex items-center gap-3 px-4 py-3',
                    isNow ? 'bg-primary-tint/60' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className="text-sm font-bold text-primary-dark">{lesson.period}</span>
                    <span className="text-[11px] text-secondary">
                      {lesson.time || '교시'}
                    </span>
                  </div>

                  {/* 시간표 칸과 같은 반 색. 목록에서는 배경 대신 띠로 쓴다 —
                      한 줄짜리 행을 통째로 칠하면 글자가 읽히지 않는다. */}
                  <span
                    aria-hidden="true"
                    className="h-9 w-1.5 shrink-0 rounded-full bg-primary-tint"
                    style={lesson.color ? { backgroundColor: lesson.color } : undefined}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-base font-bold text-text">
                      {lesson.className || '—'}
                      {isNow && (
                        <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-white">
                          지금
                        </span>
                      )}
                    </p>
                    {(lesson.subject || lesson.room) && (
                      <p className="truncate text-xs text-muted">
                        {[lesson.subject, lesson.room].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  {matched &&
                    (recorded[matched.id] === true ? (
                      <span className="shrink-0 text-xs font-semibold text-success">
                        기록 완료
                      </span>
                    ) : recorded[matched.id] === false ? (
                      <Link
                        to="/schedule?tab=records"
                        className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
                      >
                        기록하기
                      </Link>
                    ) : null)}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-bold text-text">내 수업과 동아리</h2>
          <Link
            to="/teacher"
            className="ml-auto text-sm font-semibold text-primary hover:underline"
          >
            수업 준비하기
          </Link>
        </div>

        {courses.length === 0 && !myClub ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            아직 만든 수업이나 동아리가 없습니다.{' '}
            <Link to="/teacher" className="font-semibold text-primary underline">
              교사 페이지에서 만들기
            </Link>
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {courses.map((course) => (
              <Link
                key={course.id}
                to={`/materials/${course.id}`}
                className={chipClass}
              >
                {course.name}
                {!course.published && (
                  <span className="text-xs font-normal text-secondary">준비 중</span>
                )}
              </Link>
            ))}

            {/* 동아리도 같은 줄에 둔다. 하나뿐이라 따로 구역을 만들면 제목만
                큼직하고 내용은 칩 한 개인 화면이 된다. 대신 무엇인지 알 수
                있게 이름 앞에 표를 붙인다. */}
            {myClub && (
              <Link to={`/club/${myClub.id}`} className={chipClass}>
                <span className="rounded-md bg-primary-tint px-1.5 py-0.5 text-xs font-bold text-primary-dark">
                  동아리
                </span>
                {myClub.name}
                {!myClub.published && (
                  <span className="text-xs font-normal text-secondary">준비 중</span>
                )}
              </Link>
            )}
          </div>
        )}

        {/* 수업 첫날 칠판에 적을 주소. 교사 페이지까지 들어가지 않고 여기서
            바로 복사할 수 있어야 실제로 쓰인다. */}
        {myPage && (
          <div className="mt-4">
            <CopyBox
              label="학생에게 알려줄 주소"
              value={`${location.origin}/t/${myPage.slug}`}
            />
            {!myPage.published && (
              <p className="mt-1.5 text-xs text-warning">
                아직 공개하지 않은 주소입니다. 교사 페이지에서 공개로 바꿔 주세요.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickLink to="/schedule" title="시간표" description="요일별 수업을 채웁니다." />
        <QuickLink
          to="/schedule?tab=records"
          title="수업기록"
          description="반 명단과 참여를 기록합니다."
        />
        <QuickLink to="/teacher" title="교사 페이지" description="수업과 공개 주소를 정합니다." />
      </section>
    </div>
  )
}

const chipClass =
  'flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-secondary'

function QuickLink({
  to,
  title,
  description,
}: {
  to: string
  title: string
  description: string
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-line bg-surface px-5 py-4 transition-colors hover:border-secondary"
    >
      <h3 className="font-bold text-text">{title}</h3>
      <p className="mt-0.5 text-sm text-muted">{description}</p>
    </Link>
  )
}

/* ────────────────────────────── 학생용 ────────────────────────────── */

/**
 * 학생이 홈에 오는 경우는 거의 하나다 — 선생님이 알려준 `/t/{슬러그}` 를 잊고
 * 주소창에 도메인만 친 것이다. 그래서 히어로 바로 아래에 선생님 목록을 둔다.
 * 과목만 늘어놓으면 "2학년 국어"가 셋인 목록에서 자기 것을 못 고른다.
 */
function StudentHome() {
  const [teachers, setTeachers] = useState<TeacherPage[] | null>(null)

  useEffect(() => {
    let cancelled = false

    listTeacherPages()
      .then((loaded) => {
        if (!cancelled) setTeachers(loaded)
      })
      .catch((caught) => {
        // 선생님 목록이 없어도 아래 카드로 수업자료까지는 갈 수 있다.
        console.error('선생님 목록 불러오기 실패', caught)
        if (!cancelled) setTeachers([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-line bg-surface px-6 py-14 text-center sm:px-10">
        <CharimSymbol className="mx-auto size-14 text-primary" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-primary-dark sm:text-4xl">
          오늘의 수업을 차리다.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[0.95rem] leading-relaxed text-muted">
          수업자료와 수업 내용을 한곳에서 봅니다.
        </p>
      </section>

      {teachers && teachers.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-text">선생님 찾기</h2>
          <p className="mt-1 text-sm text-muted">
            수업을 듣는 선생님을 고르면 그 선생님 수업만 보입니다.
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

      {/* 일정(시간표·수업기록)은 교사 업무용이라 학생 카드에 넣지 않는다.
          넣어봐야 firestore.rules 가 읽기를 막아 빈 화면만 보게 된다. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <QuickLink
          to="/materials"
          title="수업자료"
          description="과목별 자료와 수업목차를 확인합니다."
        />
        <QuickLink to="/club" title="동아리" description="시즌별 활동과 오늘의 미션을 봅니다." />
      </section>
    </div>
  )
}
