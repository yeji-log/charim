import { useEffect, useRef, useState } from 'react'
import type * as PptxPreview from 'pptx-preview'

import PdfViewer from './PdfViewer'

type PptxPreviewer = ReturnType<typeof PptxPreview.init>

/**
 * 수업자료(PPT·PDF) 뷰어.
 *
 * pptx-preview 로 .pptx 렌더링을 먼저 시도하고, **실패하면 조용히 PDF 로
 * 넘어간다.** CHICODE 가 테스트했을 때 이 라이브러리가 렌더링 도중 내부에서
 * 예외를 던지거나 슬라이드 0장을 돌려주는 경우가 있었다. 실제 파워포인트에서
 * 내보낸 파일은 다를 수 있지만 수업 중에 화면이 안 나오는 위험을 감수할 수는
 * 없어서, 교사가 PDF 를 함께 올리면 그쪽으로 대체한다.
 *
 * 원본 Blob 은 렌더링에만 쓰고 다운로드 링크나 URL 로 내보내지 않는다 —
 * 학생이 원본 파일을 받아가지 못하게 하려는 것이다. 핀과 같은 수준의
 * 가벼운 방지다(화면 캡처까지 막을 수는 없다).
 */
export default function SlideViewer({
  pptxFile,
  pdfFile,
  page,
  initialPage,
  onPageChange,
  onPageCountChange,
  hideControls,
  fill,
}: {
  pptxFile: Blob | null
  pdfFile: Blob | null
  /** 주면 제어되는 뷰어가 된다(발표 모드). */
  page?: number
  initialPage?: number
  onPageChange?: (page: number) => void
  onPageCountChange?: (count: number) => void
  hideControls?: boolean
  /** 컨테이너를 꽉 채운다(발표 화면). */
  fill?: boolean
}) {
  /** pptx-preview 가 실제로 그리는 대상. 로딩 중엔 hidden 이라 폭이 0이 된다. */
  const containerRef = useRef<HTMLDivElement>(null)
  /** 항상 레이아웃에 남아 있는 바깥 wrapper — 실제 렌더 폭을 재는 용도. */
  const sizingRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<PptxPreviewer | null>(null)

  const [state, setState] = useState<'loading' | 'pptx' | 'fallback' | 'failed'>('loading')
  const [internalPage, setInternalPage] = useState(1)
  const [slideCount, setSlideCount] = useState(0)

  const isControlled = page !== undefined
  const current = isControlled ? page : internalPage

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    const sizing = sizingRef.current

    if (!pptxFile || !container) {
      setState(pdfFile ? 'fallback' : 'failed')
      return
    }

    async function render() {
      try {
        const { init } = await import('pptx-preview')
        const buffer = await pptxFile!.arrayBuffer()

        // pptx-preview 는 init 시점의 크기로 고정해서 그린다. 발표 화면에서는
        // 폭만 맞추면 16:9 슬라이드가 세로로 넘치므로, 가로·세로 중 먼저
        // 닿는 쪽에 맞춰 최대 크기를 계산한다.
        const boxWidth = sizing?.clientWidth || container!.clientWidth || 960
        const boxHeight = sizing?.clientHeight || 0
        const width =
          fill && boxHeight > 0 ? Math.floor(Math.min(boxWidth, (boxHeight * 16) / 9)) : boxWidth

        const viewer = init(container!, { width, height: (width * 9) / 16, mode: 'slide' })
        viewerRef.current = viewer
        await viewer.preview(buffer)
        if (cancelled) return

        if (!viewer.slideCount) throw new Error('슬라이드를 찾지 못했습니다')

        setSlideCount(viewer.slideCount)
        onPageCountChange?.(viewer.slideCount)

        // preview() 는 항상 1번째 슬라이드를 먼저 그린다 — 다른 쪽에서
        // 시작해야 하면 한 번 더 그려서 덮는다.
        const start = Math.max(1, Math.min(viewer.slideCount, (isControlled ? page : initialPage) ?? 1))
        if (start !== 1) viewer.renderSingleSlide(start - 1)
        setInternalPage(start)
        onPageChange?.(start)
        setState('pptx')
      } catch (caught) {
        console.error('pptx 렌더링 실패 — PDF 로 대체합니다', caught)
        if (!cancelled) setState(pdfFile ? 'fallback' : 'failed')
      }
    }

    void render()

    return () => {
      cancelled = true
      viewerRef.current?.destroy()
      viewerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pptxFile, pdfFile])

  // 제어되는 쪽 번호가 바뀌면 그 슬라이드를 다시 그린다(발표 모드 동기화).
  useEffect(() => {
    if (state !== 'pptx' || !isControlled || !viewerRef.current) return
    const clamped = Math.max(1, Math.min(slideCount || 1, page))
    viewerRef.current.renderSingleSlide(clamped - 1)
  }, [state, isControlled, page, slideCount])

  function go(next: number) {
    const clamped = Math.max(1, Math.min(slideCount || 1, next))
    if (!isControlled) {
      setInternalPage(clamped)
      viewerRef.current?.renderSingleSlide(clamped - 1)
    }
    onPageChange?.(clamped)
  }

  if (state === 'fallback' && pdfFile) {
    return (
      <PdfViewer
        file={pdfFile}
        page={page}
        initialPage={initialPage}
        onPageChange={onPageChange}
        onPageCountChange={onPageCountChange}
        hideControls={hideControls}
        fill={fill}
      />
    )
  }

  if (state === 'failed') {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        수업 자료를 표시하지 못했습니다. 선생님께 PDF 를 함께 올려달라고 요청해 주세요.
      </p>
    )
  }

  return (
    <div
      ref={sizingRef}
      className={[
        'flex w-full flex-col items-center gap-3',
        fill ? 'h-full justify-center' : '',
      ].join(' ')}
    >
      {state === 'loading' && <p className="text-sm text-muted">여는 중…</p>}

      <div ref={containerRef} className={state === 'pptx' ? 'max-w-full overflow-x-auto' : 'hidden'} />

      {state === 'pptx' && !hideControls && slideCount > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => go(current - 1)}
            disabled={current <= 1}
            className="rounded-lg border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:opacity-30"
          >
            ← 이전
          </button>
          <span className="tabular-nums text-muted">
            {current} / {slideCount}
          </span>
          <button
            onClick={() => go(current + 1)}
            disabled={current >= slideCount}
            className="rounded-lg border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:opacity-30"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  )
}
