import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import ToggleSwitch from '../components/ToggleSwitch'
import BoardEditor from './BoardEditor'
import { RequireTeacher } from './Teacher'
import { deleteCourse, getCourse, updateCourse, type CourseMeta } from '../lib/courses'
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

const ghost =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'
const primary =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'
const field =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary'

const TABS = [
  { key: 'basic', label: '기본' },
  { key: 'board', label: '수업목차·내용' },
  { key: 'materials', label: '자료' },
] as const

type Tab = (typeof TABS)[number]['key']

/**
 * 과목 편집 — 모달이 아니라 주소를 가진 화면이다.
 *
 * 원래는 교사 페이지 안의 모달이었는데, 그 모달 안에서 활동 편집 모달이 또
 * 열려 모바일에서 두 겹이 쌓였다. 화면으로 빼면 세로 공간을 다 쓰고, 무엇보다
 * **아이폰에서 왼쪽 끝 스와이프(뒤로 가기)로 나갈 수 있다** — 모달은 그 동작을
 * 받아주지 않아 × 버튼을 찾아 눌러야 했다.
 *
 * 활동 편집은 여기 안에서 모달 한 겹으로 남긴다. 항목을 여러 개 고치는
 * 작업이라 "지금 이걸 고치는 중"이 분명한 편이 낫고, 이제 중첩이 아니다.
 */
export default function TeacherCourseEdit() {
  return (
    <RequireTeacher>
      <CourseEditPage />
    </RequireTeacher>
  )
}

function CourseEditPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [course, setCourse] = useState<CourseMeta | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [tab, setTab] = useState<Tab>('basic')

  useEffect(() => {
    if (!courseId) return
    let cancelled = false

    getCourse(courseId)
      .then((found) => {
        if (cancelled) return
        setCourse(found)
        setStatus(found ? 'ready' : 'missing')
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('과목 불러오기 실패', caught)
        setStatus('missing')
      })

    return () => {
      cancelled = true
    }
  }, [courseId])

  if (status === 'loading') return <p className="text-muted">불러오는 중…</p>

  if (status === 'missing' || !course || !courseId) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-10 text-center">
        <p className="font-bold text-text">과목을 찾을 수 없습니다.</p>
        <Link to="/teacher" className="mt-4 inline-block text-sm font-semibold text-primary underline">
          교사 페이지로
        </Link>
      </div>
    )
  }

  // 남의 과목은 아예 열지 않는다.
  //
  // 전에는 "보기만 가능"이었다 — 규칙이 쓰기를 막으니 화면은 열어두고 저장만
  // 못 하게 했다. 그런데 그러면 옆 반 선생님이 남의 수업자료와 수업내용을
  // 그대로 훑어볼 수 있다. 자료는 각자 수업 준비의 결과물이라, 같은 학교라도
  // 서로 열어보는 게 기본값이면 안 된다는 판단이다(사용자 결정).
  //
  // 다만 이건 화면에서 닫는 것이고 진짜 차단은 아니다. 학생이 로그인 없이
  // 자료를 봐야 해서 Firestore 읽기 규칙이 열려 있고(courses.ts 의 "가벼운
  // 잠금" 참고), 학생용 주소로 핀을 넣으면 누구든 들어간다. 서버가 막으려면
  // Blaze + Cloud Functions 가 필요하다.
  const isOwner = course.ownerUid === user?.uid

  if (!isOwner) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-10 text-center">
        <p className="font-bold text-text">다른 선생님의 과목입니다.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          수업자료와 수업내용은 만든 선생님만 열 수 있습니다.
        </p>
        <Link
          to="/teacher"
          className="mt-4 inline-block text-sm font-semibold text-primary underline"
        >
          내 교사 페이지로
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link to="/teacher" className="w-fit text-sm text-muted hover:text-text">
          ← 교사 페이지
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-primary-dark">{course.name}</h1>
          <Link to={`/materials/${course.id}`} className={ghost + ' ml-auto'}>
            학생 화면으로
          </Link>
        </div>
      </header>

      <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-line pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={[
              'shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition-colors',
              tab === entry.key
                ? 'bg-primary-tint text-primary-dark'
                : 'text-muted hover:bg-primary-tint/60 hover:text-text',
            ].join(' ')}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {/* 감추기만 하고 언마운트하지 않는다 — 탭마다 Firestore 를 읽으므로
          오갈 때마다 다시 불러오면 무료 읽기 한도를 헛되이 쓴다. */}
      <div hidden={tab !== 'basic'}>
        <BasicPanel
          course={course}
          disabled={!isOwner}
          onChanged={(patch) => setCourse({ ...course, ...patch })}
          onDeleted={() => navigate('/teacher')}
        />
      </div>
      <div hidden={tab !== 'board'}>
        <BoardEditor owner={{ courseId }} />
      </div>
      <div hidden={tab !== 'materials'}>
        {user && <MaterialManager uid={user.uid} courseId={courseId} disabled={!isOwner} />}
      </div>
    </div>
  )
}

function BasicPanel({
  course,
  disabled,
  onChanged,
  onDeleted,
}: {
  course: CourseMeta
  disabled: boolean
  onChanged: (patch: Partial<CourseMeta>) => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(course.name)
  const [pin, setPin] = useState(course.pin)
  const [notionUrl, setNotionUrl] = useState(course.notionUrl)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
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
  async function toggle(fieldName: 'published' | 'pinRequired', value: boolean) {
    try {
      await updateCourse(course.id, { [fieldName]: value })
      onChanged({ [fieldName]: value })
    } catch (caught) {
      console.error('과목 설정 변경 실패', caught)
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `"${course.name}" 과목과 그 안의 자료를 모두 지웁니다. 되돌릴 수 없습니다. 계속할까요?`,
      )
    )
      return

    setBusy(true)
    try {
      // 자료를 먼저 지운다. 과목 문서를 먼저 지우면 화면에서 그 과목을 다시
      // 열 수 없어 남은 파일을 정리하기 어렵다.
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
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:max-w-md">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">과목 이름</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={disabled}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">핀번호</span>
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            disabled={disabled}
            placeholder="예: 1234"
            className={field}
          />
          <span className="text-xs leading-relaxed text-muted">
            핀은 화면 진입을 막는 안내판입니다. 학생은 로그인이 없어서 자료 목록을 읽을 수
            있어야 하고, 그래서 마음먹으면 핀 없이도 볼 수 있습니다. 성적처럼 새면 안 되는
            것은 올리지 마세요.
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold text-text">수업 노트 링크</span>
          <input
            value={notionUrl}
            onChange={(event) => setNotionUrl(event.target.value)}
            disabled={disabled}
            placeholder="https://…"
            className={field}
          />
          <span className="text-xs text-muted">새 창으로 열립니다. 비워두면 안 보입니다.</span>
        </label>

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy || disabled} className={primary}>
            저장
          </button>
          {message && <p className="text-sm text-muted">{message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <label className="flex items-center gap-3 text-sm">
          <ToggleSwitch
            checked={course.published}
            onChange={() => !disabled && toggle('published', !course.published)}
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
            onChange={() => !disabled && toggle('pinRequired', !course.pinRequired)}
            label="핀번호 요구"
          />
          <span className="font-semibold text-text">
            핀번호 요구
            <span className="ml-1 font-normal text-muted">— 수업 중에 잠깐 풀어줄 수 있습니다</span>
          </span>
        </label>
      </div>

      {!disabled && (
        <div className="border-t border-line pt-5">
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            이 과목 지우기
          </button>
        </div>
      )}
    </section>
  )
}

function MaterialManager({
  uid,
  courseId,
  disabled,
}: {
  uid: string
  courseId: string
  disabled: boolean
}) {
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

  /**
   * 파일을 고르면 바로 올린다.
   *
   * 예전엔 "올리기" 버튼을 따로 눌러야 했는데, 화면에 저장 버튼이 여럿이라
   * 파일을 고르고 다른 저장을 눌러 올라간 줄 아는 사고가 실제로 났다
   * (SlideUploader.tsx 에도 같은 문제가 있었다). 버튼을 없애 헷갈릴 여지를
   * 지운다.
   */
  const upload = useCallback(async (file: File | undefined) => {
    if (!file) return

    setBusy(true)
    setError(null)
    try {
      const added = await addMaterial(file, { title, ownerUid: uid, courseId })
      setMaterials((prev) => [added, ...(prev ?? [])])
      setTitle('')
    } catch (caught) {
      // 형식·크기 문제는 사용자가 고칠 수 있으니 이유를 그대로 보여준다.
      if (caught instanceof MaterialValidationError) setError(caught.message)
      else {
        console.error('자료 올리기 실패', caught)
        setError('올리지 못했습니다. 다시 시도해 주세요.')
      }
    } finally {
      setBusy(false)
      // 같은 파일을 다시 고르면 change 가 안 뜨므로 값을 비운다.
      if (fileRef.current) fileRef.current.value = ''
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
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {!disabled && (
        <div className="flex flex-col gap-2 sm:max-w-md">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="제목 (비우면 파일 이름을 씁니다)"
            className={field}
          />
          <input
            ref={fileRef}
            type="file"
            disabled={busy}
            onChange={(event) => upload(event.target.files?.[0])}
            className="text-sm text-muted disabled:opacity-50"
          />
          <p className="text-xs text-muted">
            {busy ? '올리는 중…' : `파일을 고르면 바로 올라갑니다. 최대 ${formatSize(MAX_FILE_SIZE)}`}
          </p>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      )}

      {materials === null ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : materials.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
          아직 올린 자료가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {materials.map((material) => (
            <li
              key={material.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-text">{material.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {formatSize(material.size)} · {formatDate(material.createdAt)}
              </span>
              {!disabled && (
                <button
                  onClick={() => handleDelete(material)}
                  className="shrink-0 text-xs text-muted hover:text-error"
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
