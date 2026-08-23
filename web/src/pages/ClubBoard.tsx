import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import ToggleSwitch from '../components/ToggleSwitch'
import BoardEditor from './BoardEditor'
import { createMyClub, getMyClub, updateClub, type ClubMeta } from '../lib/clubs'
import {
  adoptLegacyLessons,
  listActivities,
  listLegacyLessons,
  type Activity,
} from '../lib/lessons'
import { getMyTeacherPage } from '../lib/teacherPages'

const ghost =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const primary =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'
const field =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary'

/**
 * 교사 페이지의 동아리 구역 — **내 동아리 하나**를 만들고 고친다.
 *
 * 예전에는 학교에 동아리가 하나였고 등록된 교사면 누구나 그 하나를 고쳤다.
 * 지금은 교사마다 하나씩이고, 문서 id 가 곧 uid 라 남의 것은 열 수도 고칠 수도
 * 없다(clubs.ts, firestore.rules).
 */
export default function ClubBoard() {
  const { user } = useAuth()
  const uid = user?.uid

  const [club, setClub] = useState<ClubMeta | null>(null)
  const [loaded, setLoaded] = useState(false)
  /** 공개 페이지에 표시 이름이 있는지. 없으면 동아리 목록에 이름표가 안 붙는다. */
  const [hasDisplayName, setHasDisplayName] = useState(true)
  const [activities, setActivities] = useState<Activity[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 편집 중인 값. 저장 버튼을 누를 때까지 club 에 반영하지 않는다.
  const [name, setName] = useState('')
  const [mission, setMission] = useState('')
  const [pin, setPin] = useState('')

  const applyClub = useCallback((next: ClubMeta) => {
    setClub(next)
    setName(next.name)
    setMission(next.todayMissionText)
    setPin(next.pin)
  }, [])

  useEffect(() => {
    if (!uid) return
    let cancelled = false

    Promise.all([getMyClub(uid), getMyTeacherPage(uid)])
      .then(async ([found, page]) => {
        if (cancelled) return
        setLoaded(true)
        setHasDisplayName(!!page?.displayName.trim())
        if (!found) return
        applyClub(found)
        const mine = await listActivities({ owner: { clubId: found.id } })
        if (!cancelled) setActivities(mine)
      })
      .catch((caught) => {
        console.error('동아리 불러오기 실패', caught)
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [uid, applyClub])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!uid) return
    setBusy(true)
    try {
      applyClub(await createMyClub(uid, name))
    } catch (caught) {
      console.error('동아리 만들기 실패', caught)
      setMessage('만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!club) return
    setBusy(true)
    setMessage(null)
    const patch = {
      name: name.trim() || club.name,
      todayMissionText: mission.trim(),
      pin: pin.trim(),
    }
    try {
      await updateClub(club.id, patch)
      setClub({ ...club, ...patch })
      setName(patch.name)
      setMessage('저장했습니다.')
    } catch (caught) {
      console.error('동아리 저장 실패', caught)
      setMessage('저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 스위치는 저장 버튼을 기다리지 않는다 — 켜고 끈 결과를 바로 보고 싶은 값이다. */
  async function toggle(patch: Partial<Pick<ClubMeta, 'pinRequired' | 'published'>>) {
    if (!club) return
    const next = { ...club, ...patch }
    setClub(next)
    try {
      await updateClub(club.id, patch)
    } catch (caught) {
      console.error('동아리 설정 변경 실패', caught)
      setClub(club)
    }
  }

  async function toggleFeatured(id: string) {
    if (!club) return
    const next = club.featuredActivityIds.includes(id)
      ? club.featuredActivityIds.filter((entry) => entry !== id)
      : [...club.featuredActivityIds, id]
    setClub({ ...club, featuredActivityIds: next })
    try {
      await updateClub(club.id, { featuredActivityIds: next })
    } catch (caught) {
      console.error('추천 활동 변경 실패', caught)
      setClub(club)
    }
  }

  if (!loaded) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-sm text-muted">불러오는 중…</p>
      </section>
    )
  }

  // 아직 안 만든 교사 — 이름만 받아서 연다. 나머지는 만든 뒤에 고친다.
  if (!club) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-bold text-text">동아리</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          선생님마다 동아리를 하나씩 엽니다. 다른 선생님은 이 동아리를 고칠 수 없습니다.
        </p>

        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="동아리 이름"
            className={field}
          />
          <button type="submit" disabled={busy || !name.trim()} className={primary}>
            동아리 열기
          </button>
          {message && <p className="text-sm text-error">{message}</p>}
        </form>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-bold text-text">동아리</h2>
        <Link
          to={`/club/${club.id}`}
          className="ml-auto text-sm font-semibold text-primary hover:underline"
        >
          학생 화면으로 보기
        </Link>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        다른 선생님은 이 동아리를 고칠 수 없고, 동아리 목록에서도 보지 않습니다.
      </p>

      {/* 동아리 목록의 이름표는 teacherPages 의 표시 이름에서 온다. 그게
          없으면 학생 화면에 동아리 이름만 덩그러니 뜬다 — "코딩반"이 둘이면
          자기 것을 고를 수 없다. 공개하기 전에 알려준다. */}
      {!hasDisplayName && (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-text">
          아직 <strong className="font-semibold">내 수업 주소</strong>를 만들지 않으셨습니다.
          그래서 학생이 보는 동아리 목록에 <strong className="font-semibold">선생님 이름이
          안 붙습니다.</strong> 위의 "내 수업 주소" 탭에서 주소와 표시 이름을 먼저 정해
          주세요.
        </div>
      )}

      <LegacyLessons clubId={club.id} />

      <div className="mt-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm sm:max-w-xs">
          <span className="font-semibold text-text">이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm sm:max-w-md">
          <span className="font-semibold text-text">오늘의 미션</span>
          <textarea
            value={mission}
            onChange={(event) => setMission(event.target.value)}
            rows={2}
            placeholder="비워두면 동아리 홈에 안 보입니다"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm sm:max-w-xs">
          <span className="font-semibold text-text">핀번호</span>
          <input value={pin} onChange={(event) => setPin(event.target.value)} className={field} />
        </label>

        <label className="flex items-center gap-3 text-sm">
          <ToggleSwitch
            checked={club.pinRequired}
            onChange={() => toggle({ pinRequired: !club.pinRequired })}
            label="동아리 핀번호 요구"
          />
          <span className="font-semibold text-text">
            핀번호 요구
            <span className="ml-1 font-normal text-muted">— 끄면 누구나 볼 수 있습니다</span>
          </span>
        </label>

        <label className="flex items-center gap-3 text-sm">
          <ToggleSwitch
            checked={club.published}
            onChange={() => toggle({ published: !club.published })}
            label="동아리 공개"
          />
          <span className="font-semibold text-text">
            학생에게 공개
            <span className="ml-1 font-normal text-muted">
              — 끄면 목록에 이름만 뜨고 들어갈 수 없습니다
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy} className={primary}>
            저장
          </button>
          {message && <p className="text-sm text-muted">{message}</p>}
        </div>

        {activities.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-text">동아리 홈에 띄울 활동</span>
            <div className="flex flex-wrap gap-2">
              {activities.map((activity) => {
                const on = club.featuredActivityIds.includes(activity.id)
                return (
                  <button
                    key={activity.id}
                    onClick={() => toggleFeatured(activity.id)}
                    className={
                      on
                        ? 'rounded-lg border border-primary bg-primary-tint px-3 py-1.5 text-sm font-semibold text-primary-dark'
                        : ghost
                    }
                  >
                    {on ? '✓ ' : '+ '}
                    {activity.title}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <BoardEditor owner={{ clubId: club.id }} seasonNoun="시즌" activityNoun="활동" />
      </div>
    </section>
  )
}

/**
 * 동아리가 학교에 하나뿐이던 시절의 시즌·활동을 가져오는 자리.
 *
 * 그때는 "courseId 가 없으면 동아리 것"이었다. 지금은 clubId 로 가리므로 그
 * 문서들은 어느 동아리에도 안 붙어 어느 화면에도 안 뜬다. 자동으로 아무
 * 동아리에 밀어 넣지 않는다 — 그러면 먼저 화면을 연 교사가 남의 자료까지
 * 가져간다. 남은 게 없으면 이 자리 자체가 사라지고 다시 나타나지 않는다.
 */
function LegacyLessons({ clubId }: { clubId: string }) {
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listLegacyLessons()
      .then(({ seasons, activities }) => {
        if (!cancelled) setCount(seasons.length + activities.length)
      })
      .catch((caught) => console.error('옛 동아리 자료 확인 실패', caught))
    return () => {
      cancelled = true
    }
  }, [])

  if (count === 0 && !done) return null

  async function adopt() {
    setBusy(true)
    try {
      const moved = await adoptLegacyLessons(clubId)
      setCount(0)
      setDone(`${moved}개를 가져왔습니다. 아래 목록에서 확인하세요.`)
    } catch (caught) {
      console.error('옛 동아리 자료 가져오기 실패', caught)
      setDone('가져오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      {done ? (
        <p className="text-text">{done}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-text">
            어느 동아리에도 속하지 않은 옛 시즌·활동이 <strong>{count}개</strong> 있습니다.
            동아리가 학교에 하나뿐이던 때 만든 것입니다.
          </p>
          <button onClick={adopt} disabled={busy} className={ghost + ' ml-auto'}>
            내 동아리로 가져오기
          </button>
        </div>
      )}
    </div>
  )
}
