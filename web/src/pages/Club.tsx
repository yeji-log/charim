import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import BackLink from '../components/BackLink'
import PinGate, { GateShell } from '../components/PinGate'
import TeacherPinBadge from '../components/TeacherPinBadge'
import { getClub, listClubs, type ClubMeta } from '../lib/clubs'
import { listActivities, type Activity } from '../lib/lessons'
import { isPinUnlocked } from '../lib/pinUnlock'

/**
 * 동아리 목록 — `/club`.
 *
 * 예전에는 이 주소가 곧 동아리 화면이었다. 학교에 동아리가 하나였기 때문이다.
 * 교사마다 자기 동아리를 갖게 되면서(2026-08-23) 과목과 같은 모양이 됐다 —
 * 목록에서 고르고, 핀 게이트를 지나, 시즌·활동을 본다.
 *
 * 수업자료 탭과 똑같이 로그인 상태로 갈린다. 교사에게는 **자기 동아리만**
 * 보여준다. 남의 동아리가 섞여 있어봐야 자기 것을 찾는 데 방해만 된다.
 */
export default function Clubs() {
  const { state: authState, user } = useAuth()
  const isTeacher = authState === 'teacher'
  const uid = user?.uid

  const [clubs, setClubs] = useState<ClubMeta[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    // 교사인지 아직 모르는 동안 전체 목록을 먼저 그리면, 확인이 끝나는 순간
    // 화면이 통째로 바뀐다(Materials.tsx 와 같은 이유).
    if (authState === 'loading') return

    let cancelled = false
    setClubs(null)
    setLoadError(false)

    listClubs()
      .then((loaded) => {
        if (cancelled) return
        setClubs(isTeacher && uid ? loaded.filter((club) => club.ownerUid === uid) : loaded)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('동아리 목록 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [authState, isTeacher, uid])

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        동아리 목록을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!clubs) return <p className="text-muted">불러오는 중…</p>

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark">
          {isTeacher ? '내 동아리' : '동아리'}
        </h1>
        {isTeacher && (
          <Link to="/teacher" className="ml-auto text-sm font-semibold text-primary hover:underline">
            동아리 만들기·고치기
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {isTeacher
          ? '선생님마다 동아리를 하나씩 엽니다. 여기에는 내 동아리만 보입니다.'
          : '들어갈 동아리를 고르세요.'}
      </p>

      {clubs.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          {isTeacher ? (
            <>
              아직 동아리를 열지 않으셨습니다.{' '}
              <Link to="/teacher" className="font-semibold text-primary underline">
                교사 페이지에서 만들기
              </Link>
            </>
          ) : (
            '아직 열린 동아리가 없습니다.'
          )}
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) =>
            // 준비 중인 동아리는 이름만 보이고 못 들어간다. 내 동아리는 예외다 —
            // 학생에게 열기 전에 확인해보는 게 "준비 중"의 목적이다.
            club.published || (isTeacher && club.ownerUid === uid) ? (
              <Link
                key={club.id}
                to={`/club/${club.id}`}
                className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-secondary"
              >
                <h2 className="text-lg font-bold text-text">{club.name}</h2>
                <p className="mt-1.5 text-sm text-muted">
                  {!club.published
                    ? '준비 중 — 학생에게는 아직 안 보입니다'
                    : club.pinRequired
                      ? '핀번호가 필요합니다'
                      : '바로 열람할 수 있습니다'}
                </p>
              </Link>
            ) : (
              <div
                key={club.id}
                className="rounded-2xl border border-dashed border-line p-6 opacity-70"
              >
                <h2 className="text-lg font-bold text-muted">{club.name}</h2>
                <p className="mt-1.5 text-sm text-muted">준비 중입니다</p>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  )
}

/* ──────────────────────── 게이트 + 레이아웃 ──────────────────────── */

interface ClubContext {
  club: ClubMeta
}

export function useClub(): ClubContext {
  return useOutletContext<ClubContext>()
}

/**
 * 동아리 게이트 — `/club/:clubId`.
 *
 * CourseGate 와 같은 구조다. 핀 검사를 **부모 라우트**에 두어야
 * `/club/{id}/activities` 로 직접 들어와도 건너뛸 수 없다.
 */
export function ClubGate() {
  const { clubId } = useParams<{ clubId: string }>()
  const { state: authState, user } = useAuth()

  const [club, setClub] = useState<ClubMeta | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    setStatus('loading')
    setUnlocked(false)

    getClub(clubId)
      .then((found) => {
        if (cancelled) return
        setClub(found)
        setStatus(found ? 'ready' : 'missing')
        if (found) setUnlocked(isPinUnlocked(`club:${found.id}`, found.pin))
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('동아리 불러오기 실패', caught)
        setStatus('missing')
      })

    return () => {
      cancelled = true
    }
  }, [clubId])

  if (status === 'loading') return <p className="text-muted">불러오는 중…</p>

  if (status === 'missing' || !club) {
    return (
      <GateShell>
        <h1 className="text-xl font-bold text-text">동아리를 찾을 수 없습니다</h1>
        <Link to="/club" className="text-sm font-semibold text-primary underline">
          동아리 목록으로
        </Link>
      </GateShell>
    )
  }

  // **"로그인한 교사"가 아니라 "이 동아리의 담당 교사"다.** 로그인만 하면
  // 통과시키면 옆 반 선생님이 남의 동아리를 준비 중인 상태까지 들여다본다.
  const isOwner = authState === 'teacher' && !!user && club.ownerUid === user.uid

  if (!club.published && !isOwner) {
    return (
      <GateShell>
        <h1 className="text-xl font-bold text-text">{club.name}</h1>
        <p className="text-sm text-muted">아직 준비 중인 동아리입니다.</p>
        <Link to="/club" className="text-sm font-semibold text-primary underline">
          동아리 목록으로
        </Link>
      </GateShell>
    )
  }

  if (club.pinRequired && !unlocked && !isOwner) {
    return (
      <PinGate
        title={club.name}
        pin={club.pin}
        storageKey={`club:${club.id}`}
        backTo="/club"
        backLabel="동아리 목록으로"
        onUnlock={() => setUnlocked(true)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {/* 동아리 밖으로 나가는 길. 안쪽 탭(홈·시즌·활동) 어디에 있어도
            게이트가 부모라 계속 보인다. */}
        <BackLink to="/club">동아리</BackLink>

        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-primary-dark">{club.name}</h1>

          {/* 담당 교사에게만 보이는 핀 배지 — 수업 중에 "핀번호 뭐예요?"가
              나왔을 때 교사 페이지까지 되돌아가지 않아도 된다. */}
          {isOwner && <TeacherPinBadge pinRequired={club.pinRequired} pin={club.pin} />}
        </header>
      </div>

      {!club.published && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-text">
          준비 중인 동아리입니다. 학생에게는 아직 보이지 않습니다.
        </p>
      )}

      <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-line pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ClubTab to={`/club/${club.id}`} end>
          홈
        </ClubTab>
        <ClubTab to={`/club/${club.id}/seasons`}>시즌</ClubTab>
        <ClubTab to={`/club/${club.id}/activities`}>활동</ClubTab>
      </nav>

      <Outlet context={{ club } satisfies ClubContext} />
    </div>
  )
}

/** 동아리 홈 — 오늘의 미션과 이어서 할 활동. */
export function ClubHome() {
  const { club } = useClub()
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'

  const [featured, setFeatured] = useState<Activity[] | null>(null)

  useEffect(() => {
    let cancelled = false

    if (club.featuredActivityIds.length === 0) {
      setFeatured([])
      return
    }

    listActivities({ owner: { clubId: club.id }, publishedOnly: !isTeacher })
      .then((all) => {
        if (cancelled) return
        setFeatured(all.filter((entry) => club.featuredActivityIds.includes(entry.id)))
      })
      .catch((caught) => {
        console.error('동아리 홈 불러오기 실패', caught)
        if (!cancelled) setFeatured([])
      })

    return () => {
      cancelled = true
    }
  }, [club.id, club.featuredActivityIds, isTeacher])

  if (!featured) return <p className="text-muted">불러오는 중…</p>

  if (!club.todayMissionText.trim() && featured.length === 0) {
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
      {club.todayMissionText.trim() && (
        <section className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-sm font-bold text-muted">오늘의 미션</h2>
          <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-text">
            {club.todayMissionText}
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
                  to={`/club/${club.id}/activities/${activity.id}`}
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

function ClubTab({
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
