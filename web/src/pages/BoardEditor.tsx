import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/AuthProvider'
import Modal from '../components/Modal'
import ToggleSwitch from '../components/ToggleSwitch'
import {
  addActivity,
  addSeason,
  deleteActivity,
  deleteSeason,
  listActivities,
  listSeasons,
  makeChecklistSection,
  makeSection,
  updateActivity,
  updateSeason,
  type Activity,
  type ChecklistItem,
  type Season,
  type Section,
} from '../lib/lessons'

const ghost =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const primary =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'
const field =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary'

const STATUSES: Season['status'][] = ['진행중', '준비중', '완료']

/**
 * 교사용 수업내용 보드.
 *
 * `courseId` 를 주면 그 과목의 수업목차/내용을, 안 주면 동아리의 시즌/활동을
 * 다룬다 — 화면은 하나이고 스코프만 다르다(lessonScope.ts 와 같은 이유).
 */
export default function BoardEditor({
  courseId,
  seasonNoun = '수업목차',
  activityNoun = '수업 내용',
}: {
  courseId?: string
  seasonNoun?: string
  activityNoun?: string
}) {
  const { user } = useAuth()
  const [seasons, setSeasons] = useState<Season[] | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [openActivity, setOpenActivity] = useState<Activity | null>(null)
  const [openSeason, setOpenSeason] = useState<Season | null>(null)

  const reload = useCallback(async () => {
    const [loadedSeasons, loadedActivities] = await Promise.all([
      listSeasons(courseId ? { courseId } : undefined),
      listActivities({ courseId, includePreparingSeason: true }),
    ])
    setSeasons(loadedSeasons)
    setActivities(loadedActivities)
  }, [courseId])

  useEffect(() => {
    reload().catch((caught) => {
      console.error('보드 불러오기 실패', caught)
      setSeasons([])
    })
  }, [reload])

  async function handleAddSeason() {
    const created = await addSeason({
      title: `새 ${seasonNoun}`,
      emoji: '📘',
      status: '준비중',
      order: (seasons?.length ?? 0),
      description: '',
      ...(courseId ? { courseId } : {}),
    })
    setSeasons([...(seasons ?? []), created])
    setOpenSeason(created)
  }

  async function handleAddActivity() {
    if (!user) return
    const created = await addActivity({
      title: `새 ${activityNoun}`,
      seasonId: '',
      order: activities.length,
      published: false,
      sections: [makeSection('오늘의 목표')],
      materialUrl: '',
      updatedBy: user.uid,
      ...(courseId ? { courseId } : {}),
    })
    setActivities([...activities, created])
    setOpenActivity(created)
  }

  if (!seasons) return <p className="text-sm text-muted">불러오는 중…</p>

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-text">{seasonNoun}</h3>
          <button onClick={handleAddSeason} className={ghost + ' ml-auto'}>
            + {seasonNoun} 추가
          </button>
        </div>

        {seasons.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            {seasonNoun}이(가) 아직 없습니다. {seasonNoun} 자체가 분류입니다 — 원하는 만큼
            만들어 쓰세요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {seasons.map((season) => (
              <li
                key={season.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-4 py-3"
              >
                <span className="text-lg">{season.emoji}</span>
                <span className="font-bold text-text">{season.title}</span>
                <span className="rounded-md bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary-dark">
                  {season.status}
                </span>
                <button onClick={() => setOpenSeason(season)} className={ghost + ' ml-auto'}>
                  고치기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-text">{activityNoun}</h3>
          <button onClick={handleAddActivity} className={ghost + ' ml-auto'}>
            + {activityNoun} 추가
          </button>
        </div>

        {activities.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            아직 없습니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-4 py-3"
              >
                <span className="font-bold text-text">{activity.title}</span>
                <span
                  className={[
                    'rounded-md px-2 py-0.5 text-xs font-semibold',
                    activity.published
                      ? 'bg-success/15 text-success'
                      : 'bg-warning/15 text-warning',
                  ].join(' ')}
                >
                  {activity.published ? '공개' : '준비 중'}
                </span>
                <span className="text-xs text-muted">항목 {activity.sections.length}개</span>
                <button onClick={() => setOpenActivity(activity)} className={ghost + ' ml-auto'}>
                  열기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openSeason && (
        <SeasonEditor
          season={openSeason}
          noun={seasonNoun}
          onClose={() => setOpenSeason(null)}
          onSaved={(next) => {
            setSeasons(seasons.map((s) => (s.id === next.id ? next : s)))
            setOpenSeason(null)
          }}
          onDeleted={() => {
            setSeasons(seasons.filter((s) => s.id !== openSeason.id))
            setOpenSeason(null)
          }}
        />
      )}

      {openActivity && (
        <ActivityEditor
          activity={openActivity}
          seasons={seasons}
          noun={activityNoun}
          onClose={() => setOpenActivity(null)}
          onSaved={(next) => {
            setActivities(activities.map((a) => (a.id === next.id ? next : a)))
            setOpenActivity(null)
          }}
          onDeleted={() => {
            setActivities(activities.filter((a) => a.id !== openActivity.id))
            setOpenActivity(null)
          }}
        />
      )}
    </div>
  )
}

function SeasonEditor({
  season,
  noun,
  onClose,
  onSaved,
  onDeleted,
}: {
  season: Season
  noun: string
  onClose: () => void
  onSaved: (next: Season) => void
  onDeleted: () => void
}) {
  const [draft, setDraft] = useState(season)
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { id, ...patch } = draft
      await updateSeason(id, patch)
      onSaved(draft)
    } catch (caught) {
      console.error(`${noun} 저장 실패`, caught)
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`"${season.title}" 을(를) 지웁니다. 안에 있던 내용은 남습니다.`)) return
    setBusy(true)
    try {
      await deleteSeason(season.id)
      onDeleted()
    } catch (caught) {
      console.error(`${noun} 삭제 실패`, caught)
      setBusy(false)
    }
  }

  return (
    <Modal title={`${noun} 고치기`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex gap-2">
          <label className="flex w-20 flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">이모지</span>
            <input
              value={draft.emoji}
              onChange={(event) => setDraft({ ...draft, emoji: event.target.value })}
              className={field + ' text-center'}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">이름</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              className={field}
              autoFocus
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">설명</span>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            rows={2}
            className={field}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">상태</span>
          <div className="flex gap-2">
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setDraft({ ...draft, status })}
                className={[
                  'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
                  draft.status === status
                    ? 'border-primary bg-primary-tint text-primary-dark'
                    : 'border-line text-muted hover:border-secondary',
                ].join(' ')}
              >
                {status}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">
            준비중이면 학생에게 카드도, 그 안의 내용도 보이지 않습니다.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className={primary}>
            저장
          </button>
          <button type="button" onClick={remove} disabled={busy} className={ghost}>
            지우기
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ActivityEditor({
  activity,
  seasons,
  noun,
  onClose,
  onSaved,
  onDeleted,
}: {
  activity: Activity
  seasons: Season[]
  noun: string
  onClose: () => void
  onSaved: (next: Activity) => void
  onDeleted: () => void
}) {
  const { user } = useAuth()
  const [draft, setDraft] = useState(activity)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function patchSection(index: number, patch: Partial<Section>) {
    const sections = draft.sections.map((section, i) =>
      i === index ? { ...section, ...patch } : section,
    )
    setDraft({ ...draft, sections })
  }

  // 드래그 대신 화살표로 옮긴다 — 4단계 반 탭과 같은 이유다. 아이패드에서
  // 드래그와 화면 스크롤이 충돌하지 않고, 라이브러리 40KB 를 더하지 않는다.
  function moveSection(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= draft.sections.length) return
    const sections = [...draft.sections]
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    setDraft({ ...draft, sections })
  }

  async function save() {
    if (!user) return
    setBusy(true)
    setMessage(null)
    try {
      const next = { ...draft, updatedBy: user.uid }
      await updateActivity(activity.id, {
        title: next.title,
        seasonId: next.seasonId,
        order: next.order,
        published: next.published,
        sections: next.sections,
        materialUrl: next.materialUrl,
        updatedBy: next.updatedBy,
      })
      onSaved({ ...next, updatedAt: Date.now() })
    } catch (caught) {
      console.error(`${noun} 저장 실패`, caught)
      setMessage('저장하지 못했습니다.')
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`"${activity.title}" 을(를) 지웁니다. 되돌릴 수 없습니다.`)) return
    setBusy(true)
    try {
      await deleteActivity(activity.id)
      onDeleted()
    } catch (caught) {
      console.error(`${noun} 삭제 실패`, caught)
      setBusy(false)
    }
  }

  return (
    <Modal title={`${noun} 편집`} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">제목</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className={field}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">소속</span>
          <select
            value={draft.seasonId}
            onChange={(event) => setDraft({ ...draft, seasonId: event.target.value })}
            className={field}
          >
            <option value="">(아직 없음 — 목록에만 보입니다)</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.emoji} {season.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">참고 자료 링크</span>
          <input
            value={draft.materialUrl}
            onChange={(event) => setDraft({ ...draft, materialUrl: event.target.value })}
            placeholder="https://…"
            className={field}
          />
        </label>

        <label className="flex items-center gap-3 text-sm">
          <ToggleSwitch
            checked={draft.published}
            onChange={() => setDraft({ ...draft, published: !draft.published })}
            label="학생에게 공개"
          />
          <span className="font-semibold text-text">
            학생에게 공개
            <span className="ml-1 font-normal text-muted">— 끄면 나에게만 보입니다</span>
          </span>
        </label>

        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-text">항목</h3>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setDraft({ ...draft, sections: [...draft.sections, makeSection()] })}
                className={ghost}
              >
                + 글
              </button>
              <button
                onClick={() =>
                  setDraft({ ...draft, sections: [...draft.sections, makeChecklistSection()] })
                }
                className={ghost}
              >
                + 체크리스트
              </button>
            </div>
          </div>

          {draft.sections.map((section, index) => (
            <SectionEditor
              key={section.id}
              section={section}
              index={index}
              total={draft.sections.length}
              onChange={(patch) => patchSection(index, patch)}
              onMove={(delta) => moveSection(index, delta)}
              onRemove={() =>
                setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) })
              }
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <button onClick={save} disabled={busy} className={primary}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <button onClick={remove} disabled={busy} className={ghost}>
            지우기
          </button>
          {message && <p className="text-sm text-error">{message}</p>}
        </div>
      </div>
    </Modal>
  )
}

function SectionEditor({
  section,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  section: Section
  index: number
  total: number
  onChange: (patch: Partial<Section>) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const items = section.items ?? []

  function patchItem(itemIndex: number, patch: Partial<ChecklistItem>) {
    onChange({ items: items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item)) })
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={section.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="항목 이름 (예: 준비물)"
          className={field + ' min-w-0 flex-1 font-semibold'}
        />

        <div className="flex items-center gap-1">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="위로"
            className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-30"
          >
            ▲
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="아래로"
            className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-30"
          >
            ▼
          </button>
          <button
            onClick={onRemove}
            aria-label="항목 지우기"
            className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-error hover:text-error"
          >
            ✕
          </button>
        </div>
      </div>

      {section.kind === 'checklist' ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {items.map((item, itemIndex) => (
            <div key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(event) => patchItem(itemIndex, { checked: event.target.checked })}
                className="size-4 shrink-0 accent-primary"
              />
              <input
                value={item.text}
                onChange={(event) => patchItem(itemIndex, { text: event.target.value })}
                placeholder="할 일"
                className={field + ' min-w-0 flex-1'}
              />
              <button
                onClick={() => onChange({ items: items.filter((_, i) => i !== itemIndex) })}
                aria-label="줄 지우기"
                className="shrink-0 text-xs text-muted hover:text-error"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              onChange({ items: [...items, { id: crypto.randomUUID(), text: '', checked: false }] })
            }
            className={ghost + ' w-fit'}
          >
            + 줄 추가
          </button>
          <p className="text-xs text-muted">
            체크 상태는 학생에게 그대로 보이는 안내판입니다. 학생은 바꿀 수 없습니다.
          </p>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={section.content}
            onChange={(event) => onChange({ content: event.target.value })}
            rows={section.isCode ? 6 : 4}
            placeholder={section.isCode ? '코드를 붙여넣으세요' : '내용을 적으세요'}
            className={field + (section.isCode ? ' font-mono' : '')}
          />
          <label className="flex w-fit items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={section.isCode}
              onChange={(event) => onChange({ isCode: event.target.checked })}
              className="size-3.5 accent-primary"
            />
            코드로 표시 (고정폭 글꼴 + 복사 버튼)
          </label>
        </div>
      )}
    </div>
  )
}
