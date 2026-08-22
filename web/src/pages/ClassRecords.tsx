import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/AuthProvider'
import Modal from '../components/Modal'
import {
  addClassTeacher,
  addStudent,
  addStudentsBulk,
  createClass,
  createDate,
  deleteClass,
  deleteDate,
  deleteStudent,
  isParticipating,
  listClasses,
  listDates,
  listStudents,
  removeClassTeacher,
  renameClass,
  reorderClasses,
  setAttendance,
  setClassMemo,
  type ClassMeta,
  type DateRecord,
  type Student,
} from '../lib/classRecords'
import { listAllTeacherPages, type TeacherPage } from '../lib/teacherPages'

/** 오늘 날짜를 로컬 기준 "2026-08-23" 로. toISOString() 은 UTC 라 밤에는 어제가 된다. */
function todayLocal(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatDateShort(date: string): string {
  const [, month, day] = date.split('-')
  return month && day ? `${Number(month)}/${Number(day)}` : date
}

const ghostButton =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'
const inputClass =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary'

export default function ClassRecords() {
  const { user } = useAuth()
  const uid = user?.uid

  const [classes, setClasses] = useState<ClassMeta[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false

    listClasses(uid)
      .then((loaded) => {
        if (cancelled) return
        setClasses(loaded)
        setSelectedId((prev) => prev ?? loaded[0]?.id ?? null)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('반 목록 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  const selected = classes?.find((entry) => entry.id === selectedId) ?? null

  function patchClass(classId: string, patch: Partial<ClassMeta>) {
    setClasses((prev) =>
      prev ? prev.map((entry) => (entry.id === classId ? { ...entry, ...patch } : entry)) : prev,
    )
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        반 목록을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!classes || !uid) return <p className="text-muted">불러오는 중…</p>

  return (
    <div className="flex flex-col gap-5">
      <ClassTabs
        uid={uid}
        classes={classes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreated={(created) => {
          setClasses([...classes, created])
          setSelectedId(created.id)
        }}
        onReordered={setClasses}
      />

      {selected ? (
        <ClassPanel
          key={selected.id}
          uid={uid}
          meta={selected}
          onRenamed={(name) => patchClass(selected.id, { name })}
          onMemoChanged={(memo) => patchClass(selected.id, { memo })}
          onTeachersChanged={(teacherUids) => patchClass(selected.id, { teacherUids })}
          onDeleted={() => {
            const rest = classes.filter((entry) => entry.id !== selected.id)
            setClasses(rest)
            setSelectedId(rest[0]?.id ?? null)
          }}
        />
      ) : (
        <section className="rounded-2xl border border-dashed border-line p-10 text-center text-sm leading-relaxed text-muted">
          아직 반이 없습니다. 위에서 반을 하나 만들어 주세요.
          <br />
          한 번 만들어두면 같은 반에 들어가는 동료 선생님도 그 명단을 그대로 씁니다.
        </section>
      )}
    </div>
  )
}

function ClassTabs({
  uid,
  classes,
  selectedId,
  onSelect,
  onCreated,
  onReordered,
}: {
  uid: string
  classes: ClassMeta[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreated: (created: ClassMeta) => void
  onReordered: (next: ClassMeta[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      onCreated(await createClass(uid, name))
      setName('')
      setAdding(false)
    } catch (caught) {
      console.error('반 만들기 실패', caught)
    } finally {
      setBusy(false)
    }
  }

  // 드래그 대신 화살표로 옮긴다. 라이브러리(@dnd-kit)를 안 써서 번들이 가볍고,
  // 아이패드에서 스크롤과 드래그가 충돌하지 않는다 — 교사가 태블릿으로 쓰는
  // 화면이라 이쪽이 실제로 더 잘 눌린다.
  async function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= classes.length) return
    const next = [...classes]
    ;[next[index], next[target]] = [next[target], next[index]]
    onReordered(next.map((entry, order) => ({ ...entry, order })))
    try {
      await reorderClasses(next.map((entry) => entry.id))
    } catch (caught) {
      console.error('반 순서 저장 실패', caught)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {classes.map((entry, index) => {
        const active = entry.id === selectedId
        return (
          <span
            key={entry.id}
            className={[
              'inline-flex items-center gap-1 rounded-lg border px-1 transition-colors',
              active ? 'border-primary bg-primary-tint' : 'border-line bg-surface',
            ].join(' ')}
          >
            <button
              onClick={() => onSelect(entry.id)}
              className={[
                'whitespace-nowrap px-2 py-1.5 text-sm font-bold',
                active ? 'text-primary-dark' : 'text-muted hover:text-text',
              ].join(' ')}
            >
              {entry.name}
            </button>
            {active && classes.length > 1 && (
              <>
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`${entry.name} 앞으로`}
                  className="px-1 text-xs text-muted hover:text-text disabled:opacity-30"
                >
                  ◀
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === classes.length - 1}
                  aria-label={`${entry.name} 뒤로`}
                  className="px-1 text-xs text-muted hover:text-text disabled:opacity-30"
                >
                  ▶
                </button>
              </>
            )}
          </span>
        )
      })}

      {adding ? (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 2학년 3반"
            autoFocus
            className={inputClass + ' w-36'}
          />
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? '만드는 중…' : '만들기'}
          </button>
          <button type="button" onClick={() => setAdding(false)} className={ghostButton}>
            취소
          </button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className={ghostButton}>
          + 반 추가
        </button>
      )}
    </div>
  )
}

function ClassPanel({
  uid,
  meta,
  onRenamed,
  onMemoChanged,
  onTeachersChanged,
  onDeleted,
}: {
  uid: string
  meta: ClassMeta
  onRenamed: (name: string) => void
  onMemoChanged: (memo: string) => void
  onTeachersChanged: (teacherUids: string[]) => void
  onDeleted: () => void
}) {
  const [students, setStudents] = useState<Student[] | null>(null)
  const [dates, setDates] = useState<DateRecord[]>([])
  const [loadError, setLoadError] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([listStudents(meta.id), listDates(uid, meta.id)])
      .then(([loadedStudents, loadedDates]) => {
        if (cancelled) return
        setStudents(loadedStudents)
        setDates(loadedDates)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('반 내용 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [uid, meta.id])

  const handleToggle = useCallback(
    async (dateId: string, studentId: string, next: boolean) => {
      // 낙관적으로 먼저 반영한다 — 40명을 훑으며 체크하는 화면이라 매번
      // 왕복을 기다리면 리듬이 끊긴다. 실패하면 되돌린다.
      setDates((prev) =>
        prev.map((entry) =>
          entry.id === dateId
            ? { ...entry, records: { ...entry.records, [studentId]: next } }
            : entry,
        ),
      )
      try {
        await setAttendance(uid, meta.id, dateId, studentId, next)
      } catch (caught) {
        console.error('참여 기록 저장 실패', caught)
        setDates((prev) =>
          prev.map((entry) =>
            entry.id === dateId
              ? { ...entry, records: { ...entry.records, [studentId]: !next } }
              : entry,
          ),
        )
      }
    },
    [uid, meta.id],
  )

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        반 내용을 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!students) return <p className="text-muted">불러오는 중…</p>

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-primary-dark">{meta.name}</h2>
          <p className="text-sm text-muted">
            학생 {students.length}명 · 기록한 날 {dates.length}일
          </p>
        </div>
        <button onClick={() => setSettingsOpen(true)} className={ghostButton + ' ml-auto'}>
          반 설정
        </button>
      </header>

      <StudentAddPanel
        classId={meta.id}
        onAdded={(added) => setStudents([...students, ...added])}
      />

      <NewDatePanel
        uid={uid}
        classId={meta.id}
        students={students}
        dates={dates}
        onCreated={(created) =>
          setDates((prev) =>
            prev.some((entry) => entry.id === created.id)
              ? prev
              : [...prev, created].sort((a, b) => a.date.localeCompare(b.date)),
          )
        }
      />

      {students.length > 0 && dates.length > 0 && (
        <DateSummary students={students} dates={dates} />
      )}

      <RecordTable
        uid={uid}
        classId={meta.id}
        students={students}
        dates={dates}
        onToggle={handleToggle}
        onStudentDeleted={(studentId) =>
          setStudents(students.filter((entry) => entry.id !== studentId))
        }
        onDateDeleted={(dateId) => setDates(dates.filter((entry) => entry.id !== dateId))}
      />

      {settingsOpen && (
        <ClassSettings
          uid={uid}
          meta={meta}
          onClose={() => setSettingsOpen(false)}
          onRenamed={onRenamed}
          onMemoChanged={onMemoChanged}
          onTeachersChanged={onTeachersChanged}
          onDeleted={() => {
            setSettingsOpen(false)
            onDeleted()
          }}
        />
      )}
    </div>
  )
}

function StudentAddPanel({
  classId,
  onAdded,
}: {
  classId: string
  onAdded: (added: Student[]) => void
}) {
  const [studentNumber, setStudentNumber] = useState('')
  const [name, setName] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleAddSingle(event: FormEvent) {
    event.preventDefault()
    if (!studentNumber.trim() || !name.trim()) return
    setBusy(true)
    setResult(null)
    try {
      onAdded([await addStudent(classId, studentNumber, name)])
      setStudentNumber('')
      setName('')
    } catch (caught) {
      console.error('학생 추가 실패', caught)
      setResult('추가하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkAdd() {
    if (!bulkText.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const outcome = await addStudentsBulk(classId, bulkText)
      // 몇 명이 왜 빠졌는지까지 말해준다. 조용히 버리면 명단이 비는 걸
      // 나중에야 알게 된다.
      const parts = [`${outcome.added}명 추가`]
      if (outcome.skippedDuplicate) parts.push(`중복 ${outcome.skippedDuplicate}명 건너뜀`)
      if (outcome.skippedInvalid) parts.push(`형식이 안 맞는 ${outcome.skippedInvalid}줄 건너뜀`)
      setResult(parts.join(' · '))
      setBulkText('')
      onAdded(await listStudents(classId).then((all) => all.slice(-outcome.added)))
      setBulkOpen(false)
    } catch (caught) {
      console.error('학생 일괄 추가 실패', caught)
      setResult('일괄 추가하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-2">
        <form onSubmit={handleAddSingle} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            학번
            <input
              value={studentNumber}
              onChange={(event) => setStudentNumber(event.target.value)}
              placeholder="10101"
              className={inputClass + ' w-24'}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            이름
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="홍길동"
              className={inputClass + ' w-32'}
            />
          </label>
          <button type="submit" disabled={busy} className={primaryButton}>
            추가
          </button>
        </form>

        <button onClick={() => setBulkOpen(true)} className={ghostButton}>
          여러 명 한 번에
        </button>

        {result && <p className="text-sm text-muted">{result}</p>}
      </div>

      {bulkOpen && (
        <Modal title="학생 여러 명 추가" onClose={() => setBulkOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted">
              한 줄에 한 명씩 <strong className="text-text">학번 이름</strong> 순서로
              붙여넣으세요. 엑셀에서 두 칸을 긁어 붙여넣어도 됩니다. 이미 있는 학번은
              건너뜁니다.
            </p>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={10}
              autoFocus
              placeholder={'10101 홍길동\n10102 김철수\n10103 이영희'}
              className={inputClass + ' font-mono'}
            />
            <div className="flex items-center gap-2">
              <button onClick={handleBulkAdd} disabled={busy} className={primaryButton}>
                {busy ? '추가하는 중…' : '일괄 추가'}
              </button>
              <button onClick={() => setBulkOpen(false)} className={ghostButton}>
                취소
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}

function NewDatePanel({
  uid,
  classId,
  students,
  dates,
  onCreated,
}: {
  uid: string
  classId: string
  students: Student[]
  dates: DateRecord[]
  onCreated: (created: DateRecord) => void
}) {
  const [date, setDate] = useState(todayLocal())
  const [busy, setBusy] = useState(false)

  const already = dates.some((entry) => entry.date === date)

  async function handleCreate() {
    setBusy(true)
    try {
      onCreated(await createDate(uid, classId, date, students.map((entry) => entry.id)))
    } catch (caught) {
      console.error('수업 날짜 만들기 실패', caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-muted">
        수업 날짜
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={inputClass}
        />
      </label>
      <button onClick={handleCreate} disabled={busy || already} className={primaryButton}>
        {already ? '이미 있는 날짜' : busy ? '만드는 중…' : '이 날짜 추가'}
      </button>
      <p className="text-sm text-muted">추가하면 전원 참여로 시작합니다.</p>
    </section>
  )
}

/** 가장 최근 날짜만 요약한다 — 방금 만든 기록의 현황을 바로 보고 싶은 경우다. */
function DateSummary({ students, dates }: { students: Student[]; dates: DateRecord[] }) {
  const latest = dates[dates.length - 1]
  const absent = students.filter((student) => !isParticipating(latest, student.id))

  return (
    <p className="text-sm text-muted">
      <strong className="text-text">{latest.date}</strong> — 참여{' '}
      {students.length - absent.length}명 / {students.length}명
      {absent.length > 0 && (
        <span className="text-warning">
          {' '}
          · 미참여 {absent.map((student) => student.name).join(', ')}
        </span>
      )}
    </p>
  )
}

function RecordTable({
  uid,
  classId,
  students,
  dates,
  onToggle,
  onStudentDeleted,
  onDateDeleted,
}: {
  uid: string
  classId: string
  students: Student[]
  dates: DateRecord[]
  onToggle: (dateId: string, studentId: string, next: boolean) => void
  onStudentDeleted: (studentId: string) => void
  onDateDeleted: (dateId: string) => void
}) {
  if (students.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
        아직 학생이 없습니다. 위에서 명단을 채워 주세요.
      </section>
    )
  }

  async function handleDeleteStudent(student: Student) {
    if (!window.confirm(`${student.name} 학생을 명단에서 지웁니다. 참여 기록도 함께 지워집니다.`))
      return
    try {
      await deleteStudent(uid, classId, student.id)
      onStudentDeleted(student.id)
    } catch (caught) {
      console.error('학생 삭제 실패', caught)
    }
  }

  async function handleDeleteDate(dateId: string) {
    if (!window.confirm(`${dateId} 기록을 지웁니다.`)) return
    try {
      await deleteDate(uid, classId, dateId)
      onDateDeleted(dateId)
    } catch (caught) {
      console.error('날짜 삭제 실패', caught)
    }
  }

  // 왼쪽 세 칸(번호·학번·이름)은 가로로 스크롤해도 붙어 있어야 한다. 날짜가
  // 쌓이면 표가 화면보다 훨씬 넓어지는데, 누구 줄인지 안 보이면 못 쓴다.
  const stickyHead = 'sticky z-10 border-b border-line bg-surface px-2 py-3 text-xs font-semibold text-muted'
  const stickyCell = 'sticky z-10 border-b border-line bg-surface px-2 py-2'

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className={stickyHead + ' left-0 w-10'}>#</th>
            <th className={stickyHead + ' left-10 w-20 border-l'}>학번</th>
            <th className={stickyHead + ' left-[120px] w-28 border-l text-left'}>이름</th>
            {dates.map((entry) => (
              <th key={entry.id} className="border-b border-l border-line px-2 py-3 text-xs">
                <div className="flex flex-col items-center gap-1">
                  <span className="font-semibold text-text">{formatDateShort(entry.date)}</span>
                  <button
                    onClick={() => handleDeleteDate(entry.id)}
                    aria-label={`${entry.date} 기록 지우기`}
                    className="text-[10px] font-normal text-muted hover:text-error"
                  >
                    지우기
                  </button>
                </div>
              </th>
            ))}
            <th className="border-b border-l border-line px-2 py-3 text-xs font-semibold text-muted">
              관리
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => (
            <tr key={student.id}>
              <td className={stickyCell + ' left-0 text-center text-muted'}>{index + 1}</td>
              <td className={stickyCell + ' left-10 border-l text-center text-muted'}>
                {student.studentNumber}
              </td>
              <td className={stickyCell + ' left-[120px] border-l font-semibold text-text'}>
                {student.name}
              </td>
              {dates.map((entry) => {
                const participating = isParticipating(entry, student.id)
                return (
                  <td
                    key={entry.id}
                    className="border-b border-l border-line px-2 py-2 text-center"
                  >
                    <input
                      type="checkbox"
                      checked={participating}
                      onChange={() => onToggle(entry.id, student.id, !participating)}
                      aria-label={`${student.name} ${entry.date} 참여`}
                      className="size-4 accent-primary"
                    />
                  </td>
                )
              })}
              <td className="border-b border-l border-line px-2 py-2 text-center">
                <button
                  onClick={() => handleDeleteStudent(student)}
                  className="text-xs text-muted hover:text-error"
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClassSettings({
  uid,
  meta,
  onClose,
  onRenamed,
  onMemoChanged,
  onTeachersChanged,
  onDeleted,
}: {
  uid: string
  meta: ClassMeta
  onClose: () => void
  onRenamed: (name: string) => void
  onMemoChanged: (memo: string) => void
  onTeachersChanged: (teacherUids: string[]) => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(meta.name)
  const [memo, setMemo] = useState(meta.memo ?? '')
  const [teachers, setTeachers] = useState<TeacherPage[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    listAllTeacherPages()
      .then(setTeachers)
      .catch((caught) => console.error('교사 목록 불러오기 실패', caught))
  }, [])

  const nameByUid = useMemo(() => {
    const map = new Map<string, string>()
    teachers.forEach((entry) => map.set(entry.uid, entry.displayName || entry.slug))
    return map
  }, [teachers])

  const candidates = teachers.filter((entry) => !meta.teacherUids.includes(entry.uid))

  async function handleSaveBasics() {
    setBusy(true)
    setMessage(null)
    try {
      if (name.trim() && name.trim() !== meta.name) {
        await renameClass(meta.id, name)
        onRenamed(name.trim())
      }
      if (memo.trim() !== (meta.memo ?? '')) {
        await setClassMemo(meta.id, memo)
        onMemoChanged(memo.trim())
      }
      setMessage('저장했습니다.')
    } catch (caught) {
      console.error('반 정보 저장 실패', caught)
      setMessage('저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddTeacher(targetUid: string) {
    setBusy(true)
    try {
      await addClassTeacher(meta.id, targetUid)
      onTeachersChanged([...meta.teacherUids, targetUid])
    } catch (caught) {
      console.error('담당 교사 추가 실패', caught)
      setMessage('담당 교사를 추가하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveTeacher(targetUid: string) {
    if (
      targetUid === uid &&
      !window.confirm('나를 담당에서 빼면 이 반이 더 이상 보이지 않습니다. 계속할까요?')
    )
      return

    setBusy(true)
    try {
      await removeClassTeacher(meta.id, targetUid)
      onTeachersChanged(meta.teacherUids.filter((entry) => entry !== targetUid))
      if (targetUid === uid) onDeleted()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '빼지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `"${meta.name}" 을(를) 통째로 지웁니다.\n\n학생 명단과 제 참여 기록이 모두 사라지고 되돌릴 수 없습니다. 계속할까요?`,
      )
    )
      return

    setBusy(true)
    try {
      await deleteClass(uid, meta.id)
      onDeleted()
    } catch (caught) {
      console.error('반 삭제 실패', caught)
      setMessage('지우지 못했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal title={`${meta.name} 설정`} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">반 이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">메모</span>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              rows={3}
              placeholder="이 반에 대한 메모"
              className={inputClass}
            />
          </label>

          <div className="flex items-center gap-3">
            <button onClick={handleSaveBasics} disabled={busy} className={primaryButton}>
              저장
            </button>
            {message && <p className="text-sm text-muted">{message}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-5">
          <h3 className="text-sm font-bold text-text">담당 교사</h3>
          <p className="text-xs leading-relaxed text-muted">
            여기 있는 선생님만 이 반의 명단을 봅니다. 참여 기록은 각자 따로 남으니 서로
            섞이지 않습니다.
          </p>

          <ul className="mt-1 flex flex-col gap-1">
            {meta.teacherUids.map((entry) => (
              <li
                key={entry}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span className="text-text">
                  {nameByUid.get(entry) ?? '(교사 페이지를 만들지 않은 선생님)'}
                  {entry === uid && <span className="ml-1 text-xs text-muted">— 나</span>}
                </span>
                <button
                  onClick={() => handleRemoveTeacher(entry)}
                  disabled={busy || meta.teacherUids.length === 1}
                  className="ml-auto text-xs text-muted hover:text-error disabled:opacity-30"
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>

          {candidates.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {candidates.map((entry) => (
                <button
                  key={entry.uid}
                  onClick={() => handleAddTeacher(entry.uid)}
                  disabled={busy}
                  className={ghostButton}
                >
                  + {entry.displayName || entry.slug}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">
              추가할 수 있는 선생님이 없습니다. 동료 선생님이 교사 페이지에서 자기 주소를
              먼저 정해야 여기 나옵니다.
            </p>
          )}
        </div>

        <div className="border-t border-line pt-5">
          <button
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            이 반 지우기
          </button>
        </div>
      </div>
    </Modal>
  )
}
