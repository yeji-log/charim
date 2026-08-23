import { Link } from 'react-router-dom'

/**
 * 목록으로 돌아가는 버튼. 과목 게이트와 동아리 게이트가 함께 쓴다.
 *
 * 전에는 제목 위에 작은 회색 글씨 링크였다. 있긴 있는데 **버튼으로 안 보여서**
 * 학생도 교사도 브라우저 뒤로 가기를 눌렀다 — 태블릿 전체화면에서는 그 버튼도
 * 안 보인다. 테두리를 주고 화살표를 붙여 누를 것처럼 보이게 했다.
 *
 * 게이트 헤더에 두는 게 핵심이다. 게이트가 안쪽 탭 전체를 감싸는 부모라,
 * 여기 한 번만 두면 어느 탭에 있어도 따라온다.
 */
export default function BackLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  )
}
