import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 화면 위에 띄우는 대화상자.
 *
 * 라이브러리를 쓰지 않는다 — 필요한 건 배경 딤, Esc 로 닫기, 바깥 클릭으로
 * 닫기, 포커스 되돌리기 정도이고 그건 아래 40줄이면 된다. 학교 네트워크를
 * 생각하면 번들에 넣는 코드는 적을수록 좋다.
 */
export default function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  /** 항목을 여러 개 늘어놓는 편집창처럼 넓은 자리가 필요할 때. */
  wide?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // 닫은 뒤 원래 누르던 곳으로 포커스를 돌려준다 — 키보드로 시간표를 훑는
  // 사람이 칸을 하나 고칠 때마다 페이지 맨 위로 튕기지 않도록.
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement
    panelRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // 뒤 페이지가 같이 스크롤되면 어느 쪽을 움직이는지 헷갈린다.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      ;(openerRef.current as HTMLElement | null)?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#263442]/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 패널 안쪽 클릭이 배경까지 올라가 닫히지 않도록 막는다.
        onClick={(event) => event.stopPropagation()}
        className={[
          'max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface shadow-xl outline-none sm:rounded-2xl',
          wide ? 'max-w-4xl' : 'max-w-lg',
        ].join(' ')}
      >
        <div className="sticky top-0 flex items-center gap-3 border-b border-line bg-surface px-5 py-4">
          <h2 className="text-base font-bold text-text">{title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="ml-auto rounded-lg px-2 py-1 text-lg leading-none text-muted transition-colors hover:bg-bg hover:text-text"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
