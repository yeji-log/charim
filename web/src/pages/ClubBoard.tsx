import { useEffect, useState } from 'react'

import ToggleSwitch from '../components/ToggleSwitch'
import BoardEditor from './BoardEditor'
import {
  getClubSettings,
  listActivities,
  updateClubSettings,
  type Activity,
  type ClubSettings,
} from '../lib/lessons'

const ghost =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const primary =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'
const field =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary'

/** 교사 페이지의 동아리 구역 — 홈 설정 + 시즌·활동 보드. */
export default function ClubBoard() {
  const [settings, setSettings] = useState<ClubSettings | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [mission, setMission] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([getClubSettings(), listActivities({})])
      .then(([loaded, loadedActivities]) => {
        if (cancelled) return
        setSettings(loaded)
        setMission(loaded.todayMissionText)
        setPin(loaded.pin)
        setActivities(loadedActivities)
      })
      .catch((caught) => console.error('동아리 설정 불러오기 실패', caught))

    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    if (!settings) return
    setBusy(true)
    setMessage(null)
    try {
      await updateClubSettings({ todayMissionText: mission.trim(), pin: pin.trim() })
      setSettings({ ...settings, todayMissionText: mission.trim(), pin: pin.trim() })
      setMessage('저장했습니다.')
    } catch (caught) {
      console.error('동아리 설정 저장 실패', caught)
      setMessage('저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function togglePinRequired() {
    if (!settings) return
    const next = !settings.pinRequired
    try {
      await updateClubSettings({ pinRequired: next })
      setSettings({ ...settings, pinRequired: next })
    } catch (caught) {
      console.error('동아리 핀 설정 변경 실패', caught)
    }
  }

  async function toggleFeatured(id: string) {
    if (!settings) return
    const next = settings.featuredActivityIds.includes(id)
      ? settings.featuredActivityIds.filter((entry) => entry !== id)
      : [...settings.featuredActivityIds, id]
    try {
      await updateClubSettings({ featuredActivityIds: next })
      setSettings({ ...settings, featuredActivityIds: next })
    } catch (caught) {
      console.error('추천 활동 변경 실패', caught)
    }
  }

  if (!settings) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-sm text-muted">불러오는 중…</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-text">동아리</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        과목과 달리 학교에 하나뿐인 공간입니다. 시즌과 활동은 담당 교사끼리 함께 씁니다.
      </p>

      <div className="mt-5 flex flex-col gap-4">
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
            checked={settings.pinRequired}
            onChange={togglePinRequired}
            label="동아리 핀번호 요구"
          />
          <span className="font-semibold text-text">
            핀번호 요구
            <span className="ml-1 font-normal text-muted">— 끄면 누구나 볼 수 있습니다</span>
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
                const on = settings.featuredActivityIds.includes(activity.id)
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
        <BoardEditor seasonNoun="시즌" activityNoun="활동" />
      </div>
    </section>
  )
}
