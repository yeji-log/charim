import { NavLink, Outlet } from 'react-router-dom'

import Logo from './components/Logo'

const TABS = [
  { to: '/', label: '홈', end: true },
  { to: '/materials', label: '수업자료', end: false },
  { to: '/club', label: '동아리', end: false },
]

/**
 * 일정(시간표 + 수업기록)은 교사 업무용이라 로그인한 교사에게만 노출한다.
 * 다만 이건 편의일 뿐이고 실제 방어선은 firestore.rules 다 — timetables /
 * classes 는 읽기 자체를 isMember() 로 막는다.
 *
 * TODO(2단계): AuthProvider 를 이식한 뒤 authState === 'teacher' 로 가른다.
 * 지금은 골격을 눌러볼 수 있게 항상 보여준다.
 */
const TEACHER_TABS = [{ to: '/schedule', label: '일정', end: false }]

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [
    'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
    isActive
      ? 'bg-primary-tint text-primary-dark'
      : 'text-muted hover:bg-primary-tint/60 hover:text-primary-dark',
  ].join(' ')

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-5 sm:gap-6">
          <NavLink to="/" aria-label="차림 홈">
            <Logo />
          </NavLink>

          {/* 한글은 단어 사이 공백이 없어서 flex 아이템이 좁아지면 글자 단위로
              줄바꿈된다(수/업/자/료 처럼 세로로 쌓임). 좁은 화면에서는 줄바꿈
              대신 가로 스크롤로 흐르게 한다 — min-w-0 + overflow-x-auto + 각 탭
              whitespace-nowrap 조합이 필요하다. CHICODE 가 실제로 겪고 고친 부분. */}
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...TABS, ...TEACHER_TABS].map((tab) => (
              <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <NavLink
            to="/teacher"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2.5 py-2 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-primary-dark sm:px-3"
          >
            <span className="sm:hidden">교사</span>
            <span className="hidden sm:inline">교사 페이지</span>
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-line px-5 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <p>© 차림 CHARIM</p>
          {/* 개인정보처리방침·이용약관은 실제 동작을 확인한 뒤 마지막 단계에서 쓴다. */}
        </div>
      </footer>
    </div>
  )
}
