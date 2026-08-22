import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import Modal from '../components/Modal'
import ToggleSwitch from '../components/ToggleSwitch'
import {
  createCourse,
  deleteCourse,
  listCoursesByTeacher,
  updateCourse,
  type CourseMeta,
} from '../lib/courses'
import {
  MAX_FILE_SIZE,
  MaterialValidationError,
  addMaterial,
  deleteMaterial,
  deleteMaterialsOfCourse,
  formatDate,
  formatSize,
  listMaterials,
  type MaterialMeta,
} from '../lib/materials'

const ghostButton =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'
const inputClass =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary'

/** 교사 페이지의 과목 관리 — 내 과목만 보인다. */
export default function TeacherCourses() {
  const { user } = useAuth()
  const uid = user?.uid

  const [courses, setCourses] = useState<CourseMeta[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false

    listCoursesByTeacher(uid)
      .then((loaded) => {
        if (!cancelled) setCourses(loaded)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('과목 목록 불러오기 실패', caught)
        setCourses([])
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!uid || !name.trim() || !courses) return
    setBusy(true)
    try {
      const created = await createCourse(uid, name)
      setCourses([...courses, created])
      setName('')
      setOpenId(created.id)
    } catch (caught) {
      console.error('과목 만들기 실패', caught)
    } finally {
      setBusy(false)
    }
  }

  if (!courses || !uid) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-sm text-muted">불러오는 중…</p>
      </section>
    )
  }

  const open = courses.find((entry) => entry.id === openId) ?? null

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-text">내 과목</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        여기서 만든 과목이 학생에게 보입니다. 준비가 끝나면 공개로 바꿔 주세요.
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {courses.map((course) => (
          <li
            key={course.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-4 py-3"
          >
            <span className="font-bold text-text">{course.name}</span>

            <span
              className={[
                'rounded-md px-2 py-0.5 text-xs font-semibold',
                course.published ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
              ].join(' ')}
            >
              {course.published ? '공개' : '준비 중'}
            </span>

            {course.pinRequired && (
              <span className="rounded-md bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary-dark">
                핀 {course.pin || '(미설정)'}
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              <Link to={`/materials/${course.id}`} className={ghostButton}>
                학생 화면
              </Link>
              <button onClick={() => setOpenId(course.id)} className={ghostButton}>
                열기
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 2학년 국어"
          className={inputClass + ' w-48'}
        />
        <button type="submit" disabled={busy} className={primaryButton}>
          과목 추가
        </button>
      </form>

      {open && (
        <CourseEditor
          uid={uid}
          course={open}
          onClose={() => setOpenId(null)}
          onChanged={(patch) =>
            setCourses(
              courses.map((entry) => (entry.id === open.id ? { ...entry, ...patch } : entry)),
            )
          }
          onDeleted={() => {
            setCourses(courses.filter((entry) => entry.id !== open.id))
            setOpenId(null)
          }}
        />
      )}
    </section>
  )
}

function CourseEditor({
  uid,
  course,
  onClose,
  onChanged,
  onDeleted,
}: {
  uid: string
  course: CourseMeta
  onClose: () => void
  onChanged: (patch: Partial<CourseMeta>) => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(course.name)
  const [pin, setPin] = useState(course.pin)
  const [notionUrl, setNotionUrl] = useState(course.notionUrl)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSave() {
    setBusy(true)
    setMessage(null)
    try {
      const patch = { name: name.trim(), pin: pin.trim(), notionUrl: notionUrl.trim() }
      await updateCourse(course.id, patch)
      onChanged(patch)
      setMessage('저장했습니다.')
    } catch (caught) {
      console.error('과목 저장 실패', caught)
      setMessage('저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  // 공개 여부와 핀 사용은 저장 버튼과 무관하게 즉시 반영한다 — 수업 중에
  // "지금 당장 풀어주세요"가 되어야 하는 스위치라 한 번 더 누르게 하면 늦다.
  async function toggle(field: 'published' | 'pinRequired', value: boolean) {
    try {
      await updateCourse(course.id, { [field]: value })
      onChanged({ [field]: value })
    } catch (caught) {
      console.error('과목 설정 변경 실패', caught)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `"${course.name}" 과목과 그 안의 자료를 모두 지웁니다. 되돌릴 수 없습니다. 계속할까요?`,
      )
    )
      return

    setBusy(true)
    try {
      // 자료를 먼저 지운다. 과목 문서를 먼저 지우면 courseId 로 찾을 수는
      // 있어도 화면에서 그 과목을 다시 열 수 없어 남은 파일을 정리하기 어렵다.
      await deleteMaterialsOfCourse(course.id)
      await deleteCourse(course.id)
      onDeleted()
    } catch (caught) {
      console.error('과목 삭제 실패', caught)
      setMessage('지우지 못했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal title={course.name} onClose={onClose}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">과목 이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">핀번호</span>
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="예: 1234"
              className={inputClass}
            />
            <span className="text-xs leading-relaxed text-muted">
              핀은 화면 진입을 막는 안내판입니다. 학생은 로그인이 없어서 자료 목록을
              읽을 수 있어야 하고, 그래서 마음먹으면 핀 없이도 볼 수 있습니다. 성적처럼
              새면 안 되는 것은 올리지 마세요.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold text-text">수업 노트 링크</span>
            <input
              value={notionUrl}
              onChange={(event) => setNotionUrl(event.target.value)}
              placeholder="https://…"
              className={inputClass}
            />
            <span className="text-xs text-muted">새 창으로 열립니다. 비워두면 안 보입니다.</span>
          </label>

          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={busy} className={primaryButton}>
              저장
            </button>
            {message && <p className="text-sm text-muted">{message}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <label className="flex items-center gap-3 text-sm">
            <ToggleSwitch
              checked={course.published}
              onChange={() => toggle('published', !course.published)}
              label="학생에게 공개"
            />
            <span className="font-semibold text-text">
              학생에게 공개
              <span className="ml-1 font-normal text-muted">
                — 끄면 이름만 보이고 들어갈 수 없습니다
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <ToggleSwitch
              checked={course.pinRequired}
              onChange={() => toggle('pinRequired', !course.pinRequired)}
              label="핀번호 요구"
            />
            <span className="font-semibold text-text">
              핀번호 요구
              <span className="ml-1 font-normal text-muted">
                — 수업 중에 잠깐 풀어줄 수 있습니다
              </span>
            </span>
          </label>
        </div>

        <div className="border-t border-line pt-5">
          <MaterialManager uid={uid} courseId={course.id} />
        </div>

        <div className="border-t border-line pt-5">
          <button
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            이 과목 지우기
          </button>
        </div>
      </div>
    </Modal>
  )
}

function MaterialManager({ uid, courseId }: { uid: string; courseId: string }) {
  const [materials, setMaterials] = useState<MaterialMeta[] | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listMaterials(courseId)
      .then(setMaterials)
      .catch((caught) => {
        console.error('자료 목록 불러오기 실패', caught)
        setMaterials([])
      })
  }, [courseId])

  const upload = useCallback(async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setBusy(true)
    setError(null)
    try {
      const added = await addMaterial(file, { title, ownerUid: uid, courseId })
      setMaterials((prev) => [added, ...(prev ?? [])])
      setTitle('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (caught) {
      // 형식·크기 문제는 사용자가 고칠 수 있으니 이유를 그대로 보여준다.
      if (caught instanceof MaterialValidationError) setError(caught.message)
      else {
        console.error('자료 올리기 실패', caught)
        setError('올리지 못했습니다. 다시 시도해 주세요.')
      }
    } finally {
      setBusy(false)
    }
  }, [title, uid, courseId])

  async function handleDelete(material: MaterialMeta) {
    if (!window.confirm(`"${material.title}" 을(를) 지웁니다.`)) return
    try {
      await deleteMaterial(material.id)
      setMaterials((prev) => (prev ?? []).filter((entry) => entry.id !== material.id))
    } catch (caught) {
      console.error('자료 삭제 실패', caught)
      setError('지우지 못했습니다.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-text">수업자료</h3>

      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="제목 (비우면 파일 이름을 씁니다)"
          className={inputClass}
        />
        <input ref={fileRef} type="file" className="text-sm text-muted" />
        <div className="flex items-center gap-2">
          <button onClick={upload} disabled={busy} className={primaryButton}>
            {busy ? '올리는 중…' : '올리기'}
          </button>
          <span className="text-xs text-muted">최대 {formatSize(MAX_FILE_SIZE)}</span>
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
      </div>

      {materials && materials.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {materials.map((material) => (
            <li
              key={material.id}
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-text">{material.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {formatSize(material.size)} · {formatDate(material.createdAt)}
              </span>
              <button
                onClick={() => handleDelete(material)}
                className="shrink-0 text-xs text-muted hover:text-error"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
