import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/AuthProvider'
import Modal from '../components/Modal'
import ToggleSwitch from '../components/ToggleSwitch'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  AUTO_PALETTE,
  DEFAULT_PERIODS,
  MAX_PERIODS,
  MIN_PERIODS,
  TIMETABLE_DAYS,
  cellKey,
  classColorFor,
  clearCell,
  getTimetable,
  isEmptyCell,
  saveCell,
  setClassColor,
  setPeriodTime,
  setPeriods,
  type TimetableCell,
  type TimetableData,
} from '../lib/timetable'
import { Centered, GoogleMark } from './Teacher'

/**
 * "일정" 탭 — 시간표(요일 x 교시) + 기록(반별 명단과 참여 기록, 4단계) 두 섹션.
 *
 * 교사 페이지 안의 탭이 아니라 최상단 내비게이션에 독립된 탭으로 두므로 이
 * 화면이 자기 인증 게이트를 갖는다. Teacher.tsx 와 같은 4단계
 * (loading / anonymous / not-allowed / teacher)를 따르고, 껍데기 컴포넌트는
 * 그쪽에서 가져다 쓴다.
 */
export default function Schedule() {
  const { user, state, error, signIn, signOutTeacher } = useAuth()

  if (!isFirebaseConfigured) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-text">Firebase 설정이 없습니다</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          배포 환경변수 또는 <code className="font-mono">web/.env.local</code> 을 확인해 주세요.
        </p>
      </Centered>
    )
  }

  if (state === 'loading') {
    return (
      <Centered>
        <p className="text-muted">확인 중…</p>
      </Centered>
    )
  }

  if (state === 'anonymous') {
    return (
      <Centered>
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark">교사 로그인</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          시간표와 수업기록은 로그인한 교사만 볼 수 있습니다.
        </p>
        <button
          onClick={signIn}
          className="mt-2 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-5 py-3 font-bold text-text shadow-sm transition-colors hover:border-secondary"
        >
          <GoogleMark />
          Google 계정으로 로그인
        </button>
        {error && <p className="max-w-sm text-sm text-error">{error}</p>}
      </Centered>
    )
  }

  if (state === 'not-allowed') {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-text">아직 등록되지 않은 계정입니다</h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          <strong className="font-semibold text-text">{user?.email}</strong> 은 교사 명단에
          없습니다. 교사 페이지에서 uid 를 확인해 관리자에게 등록을 요청해 주세요.
        </p>
        <button
          onClick={signOutTeacher}
          className="rounded-xl border border-line px-4 py-2.5 font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
        >
          로그아웃
        </button>
      </Centered>
    )
  }

  return <ScheduleTabs />
}

function ScheduleTabs() {
  const [section, setSection] = useState<'grid' | 'records'>('grid')

  const tabClass = (active: boolean) =>
    [
      'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
      active ? 'bg-primary-tint text-primary-dark' : 'text-muted hover:bg-primary-tint/60',
    ].join(' ')

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-2 border-b border-line pb-3">
        <button onClick={() => setSection('grid')} className={tabClass(section === 'grid')}>
          시간표
        </button>
        <button onClick={() => setSection('records')} className={tabClass(section === 'records')}>
          기록
        </button>
      </nav>

      {section === 'grid' ? (
        <TimetableBoard />
      ) : (
        <section className="rounded-2xl border border-dashed border-line p-8 text-center text-sm leading-relaxed text-muted">
          반별 학생 명단과 날짜별 참여 기록이 여기 들어옵니다.
          <br />
          4단계에서 만듭니다.
        </section>
      )}
    </div>
  )
}

function TimetableBoard() {
  const { user } = useAuth()
  const uid = user?.uid

  const [data, setData] = useState<TimetableData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [periodsInput, setPeriodsInput] = useState(DEFAULT_PERIODS)
  const [periodsBusy, setPeriodsBusy] = useState(false)
  const [selected, setSelected] = useState<{ dayIndex: number; period: number } | null>(null)

  // 같은 수업을 여러 칸에 옮겨 적을 때 매번 다시 타이핑하지 않도록 칸 하나를
  // 담아두는 자리. 브라우저 클립보드가 아니라 이 화면을 벗어나면 사라지는
  // 컴포넌트 상태다.
  const [clipboard, setClipboard] = useState<TimetableCell | null>(null)

  // 기본은 보기 전용이다. 그리드를 훑어보다 실수로 칸을 눌러 값이 바뀌는 걸
  // 막으려고, 고치려면 이 스위치를 먼저 켜야 칸이 눌린다. 새로고침하면 다시
  // 꺼지는 편이 안전해서 어디에도 기억하지 않는다.
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false

    getTimetable(uid)
      .then((loaded) => {
        if (cancelled) return
        setData(loaded)
        setPeriodsInput(loaded.periods)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('시간표 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  const applyPeriods = useCallback(
    async (next: number) => {
      if (!uid || !data) return
      const clamped = Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, next || DEFAULT_PERIODS))
      setPeriodsInput(clamped)
      if (clamped === data.periods) return

      setPeriodsBusy(true)
      try {
        await setPeriods(uid, clamped)
        setData({ ...data, periods: clamped })
      } catch (caught) {
        console.error('교시 수 변경 실패', caught)
        setPeriodsInput(data.periods)
      } finally {
        setPeriodsBusy(false)
      }
    },
    [uid, data],
  )

  function handleSaved(key: string, cell: TimetableCell) {
    setData((prev) => (prev ? { ...prev, cells: { ...prev.cells, [key]: cell } } : prev))
    setSelected(null)
  }

  // 반 색상은 칸 저장과 별개로 고르는 즉시 반영한다 — 색은 눌러본 그 자리에서
  // 바로 확인하고 싶은 종류의 설정이다.
  async function handleColorChange(className: string, color: string | null) {
    if (!uid) return
    try {
      await setClassColor(uid, className, color)
      setData((prev) => {
        if (!prev) return prev
        const nextColors = { ...prev.classColors }
        if (color === null) delete nextColors[className]
        else nextColors[className] = color
        return { ...prev, classColors: nextColors }
      })
    } catch (caught) {
      console.error('반 색상 변경 실패', caught)
    }
  }

  // 타이핑하는 동안은 화면 상태만 바꾸고, 포커스를 벗어날 때만 저장한다.
  // 교시마다 입력칸이 여러 개라 별도 state 대신 data.periodTimes 를 그대로
  // controlled value 로 쓰고, 포커스 시점 값을 담아뒀다가 실패하면 되돌린다.
  const periodTimeBeforeEdit = useRef<Record<number, string>>({})

  async function handlePeriodTimeBlur(period: number) {
    if (!uid || !data) return
    const previous = (periodTimeBeforeEdit.current[period] ?? '').trim()
    const value = (data.periodTimes[period] ?? '').trim()
    if (value === previous) return
    try {
      await setPeriodTime(uid, period, value)
    } catch (caught) {
      console.error('교시 시간 저장 실패', caught)
      setData((prev) =>
        prev ? { ...prev, periodTimes: { ...prev.periodTimes, [period]: previous } } : prev,
      )
    }
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        시간표를 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!data) return <p className="text-muted">불러오는 중…</p>

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary-dark">시간표</h1>
          <p className="text-sm text-muted">시간표는 선생님마다 각자 다릅니다.</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">편집</span>
            <ToggleSwitch
              checked={editMode}
              onChange={() => setEditMode((prev) => !prev)}
              label="시간표 편집 모드"
            />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="periods" className="font-semibold text-muted">
              교시 수
            </label>
            <input
              id="periods"
              type="number"
              min={MIN_PERIODS}
              max={MAX_PERIODS}
              value={periodsInput}
              disabled={!editMode || periodsBusy}
              onChange={(event) => setPeriodsInput(Number(event.target.value))}
              onBlur={(event) => applyPeriods(Number(event.target.value))}
              className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-center disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
      </header>

      {!editMode && (
        <p className="text-sm text-muted">
          보기 전용입니다. 고치려면 편집 스위치를 켜주세요.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-16 border-b border-line px-2 py-3 text-xs font-semibold text-muted">
                교시
              </th>
              {TIMETABLE_DAYS.map((day) => (
                <th
                  key={day}
                  className="border-b border-l border-line px-2 py-3 font-bold text-text"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: data.periods }, (_, index) => index + 1).map((period) => (
              <tr key={period}>
                <th className="border-b border-line px-2 py-3 text-xs font-semibold text-muted">
                  <div className="flex flex-col items-center gap-1">
                    <span>{period}</span>
                    {editMode ? (
                      <input
                        type="text"
                        value={data.periodTimes[period] ?? ''}
                        placeholder="시간"
                        onFocus={(event) => {
                          periodTimeBeforeEdit.current[period] = event.target.value
                        }}
                        onChange={(event) =>
                          setData((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  periodTimes: {
                                    ...prev.periodTimes,
                                    [period]: event.target.value,
                                  },
                                }
                              : prev,
                          )
                        }
                        onBlur={() => handlePeriodTimeBlur(period)}
                        className="w-14 rounded border border-line bg-surface px-1 py-0.5 text-center text-[10px] font-normal"
                      />
                    ) : (
                      data.periodTimes[period] && (
                        <span className="font-normal text-secondary">
                          {data.periodTimes[period]}
                        </span>
                      )
                    )}
                  </div>
                </th>

                {TIMETABLE_DAYS.map((_day, dayIndex) => {
                  const key = cellKey(dayIndex, period)
                  const cell = data.cells[key]
                  const empty = isEmptyCell(cell)

                  // 반이 큰 글씨를, 과목·교실이 작은 보조 글씨를 차지한다 —
                  // 시간표를 훑을 때 먼저 눈에 들어와야 하는 건 "몇 반인지"다.
                  const content = empty ? (
                    editMode ? <span className="m-auto text-lg">+</span> : null
                  ) : (
                    <>
                      <span className="w-full truncate text-base font-bold text-text">
                        {cell!.className || '—'}
                      </span>
                      <span className="w-full truncate text-xs text-muted">
                        {[cell!.room, cell!.subject].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  )

                  // 반 이름이 있으면 그 반의 색을 칸 배경에 쓴다. 임의의 hex 라
                  // 정적 Tailwind 클래스로는 못 만들어서 인라인 style 로 칠한다.
                  // hover 는 밝기만 낮추는 필터를 써서 어떤 배경색에도 똑같이
                  // 먹힌다.
                  const cellColor =
                    !empty && cell!.className.trim() ? classColorFor(data, cell!.className) : null
                  const cellClass = [
                    'flex h-16 w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-left transition-[filter]',
                    empty ? 'text-secondary' : '',
                    !cellColor && !empty ? 'bg-primary-tint' : '',
                    editMode
                      ? cellColor
                        ? 'hover:brightness-95'
                        : 'hover:bg-primary-tint'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  const cellStyle = cellColor ? { backgroundColor: cellColor } : undefined

                  return (
                    <td key={key} className="border-b border-l border-line p-1.5 align-top">
                      {editMode ? (
                        <button
                          onClick={() => setSelected({ dayIndex, period })}
                          className={cellClass}
                          style={cellStyle}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className={cellClass} style={cellStyle}>
                          {content}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && uid && (
        <CellEditor
          uid={uid}
          dayIndex={selected.dayIndex}
          period={selected.period}
          cell={data.cells[cellKey(selected.dayIndex, selected.period)]}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          clipboard={clipboard}
          onCopy={setClipboard}
          classColors={data.classColors}
          onColorChange={handleColorChange}
        />
      )}
    </div>
  )
}

function CellEditor({
  uid,
  dayIndex,
  period,
  cell,
  onClose,
  onSaved,
  clipboard,
  onCopy,
  classColors,
  onColorChange,
}: {
  uid: string
  dayIndex: number
  period: number
  cell: TimetableCell | undefined
  onClose: () => void
  onSaved: (key: string, cell: TimetableCell) => void
  clipboard: TimetableCell | null
  onCopy: (cell: TimetableCell) => void
  classColors: Record<string, string>
  onColorChange: (className: string, color: string | null) => Promise<void>
}) {
  const key = cellKey(dayIndex, period)
  const [subject, setSubject] = useState(cell?.subject ?? '')
  const [className, setClassName] = useState(cell?.className ?? '')
  const [room, setRoom] = useState(cell?.room ?? '')
  const [note, setNote] = useState(cell?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [colorBusy, setColorBusy] = useState(false)

  const trimmedClassName = className.trim()
  const hasManualColor = trimmedClassName in classColors
  const effectiveColor = trimmedClassName ? classColorFor({ classColors }, trimmedClassName) : null

  async function handlePickColor(color: string | null) {
    if (!trimmedClassName) return
    setColorBusy(true)
    try {
      await onColorChange(trimmedClassName, color)
    } finally {
      setColorBusy(false)
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    const next: TimetableCell = {
      subject: subject.trim(),
      className: className.trim(),
      room: room.trim(),
      note: note.trim(),
    }
    setBusy(true)
    setSaveError(null)
    try {
      await saveCell(uid, key, next)
      onSaved(key, next)
    } catch (caught) {
      console.error('시간표 칸 저장 실패', caught)
      setSaveError('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    setBusy(true)
    setSaveError(null)
    try {
      await clearCell(uid, key)
      onSaved(key, { subject: '', className: '', room: '', note: '' })
    } catch (caught) {
      console.error('시간표 칸 비우기 실패', caught)
      setSaveError('비우지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  // 저장 여부와 무관하게 지금 입력창에 보이는 값을 그대로 가져간다. 붙여넣은
  // 뒤에도 자동 저장하지 않는다 — 값을 확인하고 고칠 여지를 남긴다.
  function handleCopy() {
    onCopy({
      subject: subject.trim(),
      className: className.trim(),
      room: room.trim(),
      note: note.trim(),
    })
  }

  function handlePaste() {
    if (!clipboard) return
    setSubject(clipboard.subject)
    setClassName(clipboard.className)
    setRoom(clipboard.room)
    setNote(clipboard.note)
  }

  const inputClass =
    'rounded-lg border border-line bg-surface px-3 py-2 text-text outline-none focus:border-secondary'
  const ghostButton =
    'rounded-lg border border-line px-4 py-2 font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <Modal title={`${TIMETABLE_DAYS[dayIndex]}요일 ${period}교시`} onClose={onClose}>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">반</span>
          <input
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            placeholder="예: 2-3반"
            className={inputClass}
            autoFocus
          />
        </label>

        {/* 반 이름을 아직 안 썼으면 어떤 반에 색을 지정하는 건지 알 수 없으니
            숨긴다. 색은 저장 버튼과 무관하게 고르는 즉시 반영된다. */}
        {trimmedClassName && (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">반 색상</span>
            <div className="flex flex-wrap items-center gap-2">
              {AUTO_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${trimmedClassName} 색상을 ${color} 로 지정`}
                  disabled={colorBusy}
                  onClick={() => handlePickColor(color)}
                  className={[
                    'size-7 shrink-0 rounded-full ring-offset-2 transition-shadow disabled:cursor-not-allowed',
                    effectiveColor === color ? 'ring-2 ring-primary' : 'ring-1 ring-line',
                  ].join(' ')}
                  style={{ backgroundColor: color }}
                />
              ))}

              <input
                type="color"
                aria-label={`${trimmedClassName} 색상 직접 선택`}
                value={effectiveColor ?? '#ffffff'}
                disabled={colorBusy}
                onChange={(event) => handlePickColor(event.target.value)}
                className="size-7 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 disabled:cursor-not-allowed"
              />

              {hasManualColor && (
                <button
                  type="button"
                  disabled={colorBusy}
                  onClick={() => handlePickColor(null)}
                  className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  자동으로
                </button>
              )}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">교실</span>
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            placeholder="예: 3학년 3반 교실"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">과목</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="예: 국어"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">메모</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="준비물, 특이사항 등"
            rows={2}
            className={inputClass}
          />
        </label>

        {saveError && <p className="text-sm text-error">{saveError}</p>}

        {clipboard && !isEmptyCell(clipboard) && (
          <p className="text-xs text-muted">
            복사해둔 내용:{' '}
            <span className="font-semibold text-text">
              {[clipboard.className, clipboard.room, clipboard.subject].filter(Boolean).join(' · ')}
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '저장 중…' : '저장'}
          </button>
          <button type="button" onClick={handleCopy} disabled={busy} className={ghostButton}>
            복사
          </button>
          <button
            type="button"
            onClick={handlePaste}
            disabled={busy || !clipboard}
            className={ghostButton}
          >
            붙여넣기
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 font-semibold text-muted transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            비우기
          </button>
        </div>
      </form>
    </Modal>
  )
}
