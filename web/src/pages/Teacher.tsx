import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { CharimSymbol } from '../components/Logo'
import TeacherCourses from './TeacherCourses'
import ClubBoard from './ClubBoard'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  SlugError,
  getMyTeacherPage,
  normalizeSlug,
  saveTeacherPage,
  type TeacherPage,
} from '../lib/teacherPages'

export default function Teacher() {
  return (
    <RequireTeacher>
      <TeacherDashboard />
    </RequireTeacher>
  )
}

/**
 * 교사 인증 게이트.
 *
 * 교사 화면이 여럿(교사 페이지, 과목 편집)이라 게이트를 컴포넌트로 뺐다.
 * 화면마다 4단계 분기를 복제하면 한쪽만 고치는 실수가 난다.
 *
 * 여기서 하는 확인은 화면을 그리기 위한 것이지 보안 장치가 아니다. 실제 차단은
 * firestore.rules 가 한다.
 */
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { state, error, signIn } = useAuth()

  if (!isFirebaseConfigured) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-text">Firebase 설정이 없습니다</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          <Code>web/.env.local</Code> 에 설정값을 넣고 개발 서버를 다시 시작해 주세요. 항목
          이름은 <Code>web/.env.example</Code> 에 있습니다. 배포본이라면 Vercel 환경 변수를
          확인해 주세요.
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
        <CharimSymbol className="size-12 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark">교사 로그인</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          등록된 교사만 들어올 수 있습니다. 학생은 로그인 없이{' '}
          <Link to="/materials" className="font-semibold text-primary underline">
            수업자료
          </Link>
          를 봅니다.
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

  if (state === 'not-allowed') return <NotAllowed />

  return <>{children}</>
}

/**
 * 로그인은 됐지만 아직 멤버가 아닌 상태.
 *
 * 여기서 uid 를 그대로 보여주는 게 중요하다. 멤버 문서가 있어야 교사가 되는데
 * uid 는 로그인해야 생기므로, 처음 등록할 때 반드시 이 화면을 한 번 거친다.
 * Firebase 콘솔의 Authentication → Users 에서 찾아 복사할 수도 있지만, 화면에
 * 띄워두면 그 왕복이 없어진다. 동료 교사를 추가할 때도 같은 화면을 쓴다 —
 * "여기 들어가서 로그인하고 뜨는 값 보내주세요"로 끝난다.
 *
 * uid 는 그 자체로 아무 정보도 아니라서 화면에 드러나도 문제가 없다.
 */
function NotAllowed() {
  const { user, signOutTeacher } = useAuth()

  return (
    <Centered>
      <h1 className="text-xl font-bold text-text">아직 등록되지 않은 계정입니다</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">
        <strong className="font-semibold text-text">{user?.email}</strong> 로 로그인했지만 교사
        명단에 없습니다. 아래 값을 관리자에게 보내면 등록해 드립니다.
      </p>

      {user && <CopyBox label="내 uid" value={user.uid} />}

      <button
        onClick={signOutTeacher}
        className="rounded-xl border border-line px-4 py-2.5 font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
      >
        로그아웃
      </button>
    </Centered>
  )
}

function TeacherDashboard() {
  const { user, signOutTeacher } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary-dark">교사 페이지</h1>
          <p className="text-sm text-muted">수업을 준비하고 학생에게 보여줄 것을 정합니다.</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted">{user?.email}</span>
          <button
            onClick={signOutTeacher}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
          >
            로그아웃
          </button>
        </div>
      </header>

      <DashboardTabs />
    </div>
  )
}

/**
 * 교사 페이지는 성격이 다른 세 덩어리로 나뉜다. 한 화면에 쌓아두면 과목 하나
 * 고치러 들어와도 아래 동아리까지 지나가야 해서 스크롤이 길어진다. 일정 화면의
 * 시간표/기록 탭과 같은 방식으로 나눈다.
 *
 * 탭 상태를 주소에 남기지 않고 컴포넌트 state 로만 둔다 — 교사 페이지는
 * 학생에게 링크로 건네는 화면이 아니라 북마크할 이유가 없고, 라우트를 늘리면
 * 뒤로 가기가 탭 전환마다 걸려 오히려 성가시다.
 */
const DASHBOARD_TABS = [
  { key: 'address', label: '내 수업 주소' },
  { key: 'courses', label: '과목' },
  { key: 'club', label: '동아리' },
] as const

type DashboardTab = (typeof DASHBOARD_TABS)[number]['key']

function DashboardTabs() {
  const [tab, setTab] = useState<DashboardTab>('courses')

  return (
    <>
      {/* 한글은 단어 사이 공백이 없어서 좁은 화면에서 글자 단위로 쌓인다.
          min-w-0 + overflow-x-auto + whitespace-nowrap 으로 막는다. */}
      <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-line pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DASHBOARD_TABS.map((entry) => (
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

      {/* 탭을 오갈 때마다 다시 불러오지 않도록 감추기만 한다 — 과목 목록과
          동아리 보드는 각자 Firestore 를 읽으므로, 언마운트하면 탭을 누를
          때마다 읽기가 발생한다(무료 한도가 하루 5만 읽기다). */}
      <div hidden={tab !== 'address'}>
        <TeacherPageSettings />
      </div>
      <div hidden={tab !== 'courses'}>
        <TeacherCourses />
      </div>
      <div hidden={tab !== 'club'}>
        <ClubBoard />
      </div>
    </>
  )
}

/** 내 공개 주소(/t/{슬러그}) 정하기. */
function TeacherPageSettings() {
  const { user } = useAuth()
  const [savedSlug, setSavedSlug] = useState<string | undefined>()
  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [published, setPublished] = useState(true)
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving'>('loading')
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    getMyTeacherPage(user.uid)
      .then((found) => {
        if (cancelled) return
        if (found) {
          setSavedSlug(found.slug)
          setSlug(found.slug)
          setDisplayName(found.displayName)
          setPublished(found.published)
        }
        setStatus('idle')
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('교사 페이지 조회 실패', caught)
        setMessage({ kind: 'error', text: '주소를 불러오지 못했습니다. 새로고침해 주세요.' })
        setStatus('idle')
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const save = useCallback(async () => {
    if (!user) return
    setMessage(null)

    let normalized: string
    try {
      normalized = normalizeSlug(slug)
    } catch (caught) {
      setMessage({ kind: 'error', text: (caught as Error).message })
      return
    }

    if (!displayName.trim()) {
      setMessage({ kind: 'error', text: '표시 이름을 입력해 주세요.' })
      return
    }

    // 주소를 바꾸면 학생들이 이미 아는 주소가 죽는다. 학기 중이면 수백 명이
    // 404 를 보게 되므로, 막지는 않되 반드시 한 번 묻는다.
    if (savedSlug && savedSlug !== normalized) {
      const ok = window.confirm(
        '주소를 /t/' +
          savedSlug +
          ' 에서 /t/' +
          normalized +
          ' 로 바꿉니다.\n\n' +
          '학생들에게 이미 알려준 예전 주소는 더 이상 열리지 않습니다. 계속할까요?',
      )
      if (!ok) return
    }

    setStatus('saving')
    try {
      const next: TeacherPage = {
        slug: normalized,
        uid: user.uid,
        displayName: displayName.trim(),
        published,
      }
      await saveTeacherPage(next, savedSlug)
      setSavedSlug(normalized)
      setSlug(normalized)
      setMessage({ kind: 'ok', text: '저장했습니다.' })
    } catch (caught) {
      const text =
        caught instanceof SlugError
          ? caught.message
          : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      if (!(caught instanceof SlugError)) console.error('교사 페이지 저장 실패', caught)
      setMessage({ kind: 'error', text })
    } finally {
      setStatus('idle')
    }
  }, [user, slug, displayName, published, savedSlug])

  if (status === 'loading') {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-sm text-muted">불러오는 중…</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-text">내 수업 주소</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        학생에게 알려줄 주소입니다. 이 주소로 들어오면 제 과목만 보입니다.
      </p>

      <div className="mt-5 grid gap-4 sm:max-w-md">
        <label className="block">
          <span className="text-sm font-semibold text-text">주소</span>
          <div className="mt-1.5 flex items-center rounded-lg border border-line focus-within:border-secondary">
            <span className="shrink-0 whitespace-nowrap pl-3 text-sm text-muted">
              {location.host}/t/
            </span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="kim"
              spellCheck={false}
              autoCapitalize="none"
              className="w-full min-w-0 rounded-r-lg bg-transparent py-2.5 pr-3 text-sm outline-none"
            />
          </div>
          <span className="mt-1 block text-xs text-muted">
            영문 소문자·숫자·하이픈. 한글은 주소창에서 깨져 보여 쓸 수 없습니다.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-text">표시 이름</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="김OO 선생님"
            className="mt-1.5 w-full rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-secondary"
          />
          <span className="mt-1 block text-xs text-muted">
            학생에게 보이는 이름입니다. 실명이 아니어도 됩니다.
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span className="text-sm text-text">
            학생용 홈의 선생님 목록에 표시
            <span className="mt-0.5 block text-xs text-muted">
              꺼도 주소를 아는 학생은 들어올 수 있습니다.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={status === 'saving'}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {status === 'saving' ? '저장 중…' : '저장'}
          </button>
          {message && (
            <p className={message.kind === 'error' ? 'text-sm text-error' : 'text-sm text-success'}>
              {message.text}
            </p>
          )}
        </div>
      </div>

      {savedSlug && (
        <div className="mt-6 border-t border-line pt-5">
          <CopyBox
            label="학생에게 알려줄 주소"
            value={location.origin + '/t/' + savedSlug}
          />
        </div>
      )}
    </section>
  )
}

/** 값을 그대로 보여주고 복사 버튼을 붙인다. 홈(교사용)도 공개 주소에 이걸 쓴다. */
export function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard 는 https 나 localhost 가 아니면 막힌다. 그럴 땐 직접 긁어
      // 복사하면 되므로 값은 이미 화면에 다 보인다.
      setCopied(false)
    }
  }, [value])

  return (
    <div className="w-full max-w-md text-left">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2.5">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-text">
          {value}
        </code>
        <button
          onClick={copy}
          className="shrink-0 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
    </div>
  )
}

/** 인증 게이트 화면들의 공통 껍데기. Schedule.tsx 도 같은 게이트를 쓰므로 함께 쓴다. */
export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      {children}
    </div>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  )
}
