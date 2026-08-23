import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * PDF 뷰어.
 *
 * 브라우저 내장 뷰어(<iframe src="blob:…">)에 맡기면 환경에 따라 화면이
 * 비어버린다. blob 주소로 만든 PDF 는 렌더링을 거부하는 경우가 있고, 모바일
 * 브라우저는 iframe 안에서 PDF 를 아예 못 여는 경우가 많다. 그래서 pdf.js 로
 * 직접 캔버스에 그린다.
 *
 * pdf.js 는 1MB 가 넘으므로 이 컴포넌트가 실제로 쓰일 때만 내려받는다
 * (동적 import). 발표를 안 여는 사람은 이 무게를 지지 않는다.
 *
 * **이 파일에 있는 대부분의 방어 코드는 CHICODE 가 실기기에서 겪은 증상을
 * 고친 것이다.** 지우기 전에 주석을 읽을 것.
 */

type PdfDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPage>
}

/** pdf.js 6 에서 문서에는 destroy() 가 없다. 정리는 로딩 작업이 맡는다. */
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> }

type RenderTask = { promise: Promise<void>; cancel: () => void }

type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  // pdf.js 6 부터 canvas 가 필수다. 예전 방식(canvasContext)만 넘기면 렌더가 끝나지 않는다.
  render: (options: {
    canvas: HTMLCanvasElement
    viewport: { width: number; height: number }
  }) => RenderTask
}

const LOAD_TIMEOUT_MS = 15_000
const RENDER_TIMEOUT_MS = 15_000

/**
 * 일부 태블릿은 캔버스 한 변이 일정 크기를 넘으면 오류 없이 빈 화면만 남긴다
 * (GPU 텍스처 한도로 추정). 발표 전체화면처럼 크게 그릴 때 특히 걸린다.
 * 화질 차이가 거의 안 느껴지는 선에서 제한한다.
 */
const MAX_CANVAS_SIDE = 1600

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

export default function PdfViewer({
  file,
  page: controlledPage,
  initialPage,
  onPageChange,
  onPageCountChange,
  hideControls,
  fill,
}: {
  file: Blob
  /** 주면 "제어되는" 뷰어가 된다 — 발표 모드에서 교사 조작이나 실시간으로
   *  받은 쪽 번호를 그대로 반영한다. 안 주면 내부 상태로 알아서 넘긴다. */
  page?: number
  /** 제어되지 않는 뷰어가 처음 열 때 보여줄 쪽. */
  initialPage?: number
  onPageChange?: (page: number) => void
  onPageCountChange?: (pageCount: number) => void
  hideControls?: boolean
  /** 컨테이너를 꽉 채운다 — 폭뿐 아니라 높이에도 맞춘다(발표 화면). */
  fill?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const documentRef = useRef<PdfDocument | null>(null)
  const loadingTaskRef = useRef<PdfLoadingTask | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  /** 렌더를 한 줄로 세우는 체인. 겹쳐 그리면 캔버스가 비어버린다. */
  const renderChainRef = useRef<Promise<void>>(Promise.resolve())
  const generationRef = useRef(0)

  const [pageCount, setPageCount] = useState(0)
  const [internalPage, setInternalPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const isControlled = controlledPage !== undefined
  const page = isControlled ? controlledPage : internalPage

  function goToPage(next: number) {
    const clamped = Math.max(1, Math.min(pageCount || 1, next))
    if (!isControlled) setInternalPage(clamped)
    onPageChange?.(clamped)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist')
        // 워커 주소는 번들러가 만든 것을 그대로 쓴다. CDN 을 타지 않으므로
        // 학교 네트워크가 외부를 막아도 동작한다.
        const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default

        const data = new Uint8Array(await file.arrayBuffer())

        // **cMap/표준 폰트 데이터를 빼면 한글이 깨진다.** 폰트가 통짜로
        // 임베드되지 않아 CID 매핑이 필요하거나 표준 폰트로 대체해야 하는
        // 글자가 네모나 엉뚱한 글자로 나온다. 실기기에서 확인된 증상이라
        // 이 두 줄을 지우지 말 것. 파일은 postinstall 이 node_modules 안의
        // pdfjs-dist 에서 public/pdfjs 로 복사해둔다(외부 CDN 금지 원칙).
        //
        // 참고로 disableFontFace: true 는 **답이 아니다.** CHICODE 가 그쪽도
        // 시도했다가 되돌렸다 — 그 경로에서는 pdf.js 가 브라우저 폰트 API
        // 없이 직접 폰트를 파싱하는데, 문제의 기기에서는 그게 실패해 모든
        // 폰트가 대체 폰트로 그려졌다. 기본값(false)이 맞다.
        const task = pdfjs.getDocument({
          data,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
        }) as unknown as PdfLoadingTask
        loadingTaskRef.current = task

        // 모듈 워커를 못 돌리는 기기는 오류를 던지지 않고 그냥 영영 응답이
        // 없다 — 화면엔 "여는 중…"만 남아 흰 화면처럼 보인다. 시간을 넘기면
        // 명확한 오류로 바꿔 최소한 무엇이 문제인지 알 수 있게 한다.
        const loaded = await withTimeout(
          task.promise,
          LOAD_TIMEOUT_MS,
          '문서를 여는 데 시간이 너무 오래 걸립니다',
        )

        if (cancelled) {
          void task.destroy()
          return
        }

        documentRef.current = loaded
        setPageCount(loaded.numPages)
        onPageCountChange?.(loaded.numPages)
        if (!isControlled) {
          const start = Math.max(1, Math.min(loaded.numPages, initialPage ?? 1))
          setInternalPage(start)
          onPageChange?.(start)
        }
        setLoading(false)
      } catch (caught) {
        if (cancelled) return
        console.error('PDF 열기 실패', caught)
        setError(
          '이 PDF 를 화면에 표시하지 못했습니다. 이 기기·브라우저와 맞지 않을 수 있습니다. 다른 브라우저로 다시 시도해 주세요.',
        )
        setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      documentRef.current = null
      void loadingTaskRef.current?.destroy()
      loadingTaskRef.current = null
    }
    // file 이 바뀔 때만 다시 연다. 콜백이 매 렌더 새로 만들어져도 재로딩하면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  /**
   * 현재 쪽을 컨테이너 너비에 맞춰 그린다.
   *
   * pdf.js 는 같은 캔버스에 두 렌더가 겹치는 걸 허용하지 않는다. 첫 렌더와
   * 크기 변경 렌더가 겹치면 둘 다 어그러져 빈 화면이 남는다. 취소만으로는
   * 부족하다 — 둘 다 getPage 를 기다리는 동안에는 취소할 대상이 아예 없어서,
   * 앞선 렌더가 완전히 끝난 뒤에 시작하도록 체인으로 한 줄 세운다.
   */
  const renderPage = useCallback(() => {
    const generation = ++generationRef.current
    renderTaskRef.current?.cancel()

    const chained = renderChainRef.current
      .catch(() => {})
      .then(async () => {
        if (generation !== generationRef.current) return

        const pdf = documentRef.current
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!pdf || !canvas || !container) return

        const target = await pdf.getPage(page)
        if (generation !== generationRef.current) return

        const base = target.getViewport({ scale: 1 })

        // 평소에는 폭에만 맞춘다(세로로 길면 스크롤해서 본다). 발표 화면은
        // 스크롤할 수 없으므로 높이에도 맞춰야 한다 — 폭에만 맞추면 16:9
        // 슬라이드가 화면 아래로 넘쳐 잘리고, 그걸 피하려고 폭을 줄여두면
        // 이번엔 화면이 텅 빈 채 슬라이드만 작게 남는다.
        const padding = fill ? 8 : 32
        const availableWidth = Math.max(container.clientWidth - padding, 100)
        const widthScale = availableWidth / base.width
        const scale = fill
          ? Math.max(
              Math.min(widthScale, Math.max(container.clientHeight - padding, 100) / base.height),
              0.1,
            )
          : Math.max(widthScale, 0.1)
        const ratio = Math.min(window.devicePixelRatio || 1, 2)

        // **화면에 보이는 크기와 그리는 해상도를 반드시 분리한다.** 예전엔
        // 아래 해상도 캡이 걸리는 순간 화면 크기까지 같이 줄어들어 "학생 화면
        // PPT 가 작게 보인다"는 보고가 나왔다. 캡은 renderViewport 에만 건다.
        const displayViewport = target.getViewport({ scale })

        let renderViewport = target.getViewport({ scale: scale * ratio })
        const longestSide = Math.max(renderViewport.width, renderViewport.height)
        if (longestSide > MAX_CANVAS_SIDE) {
          renderViewport = target.getViewport({
            scale: (scale * ratio * MAX_CANVAS_SIDE) / longestSide,
          })
        }

        canvas.width = renderViewport.width
        canvas.height = renderViewport.height
        canvas.style.width = `${displayViewport.width}px`
        canvas.style.height = `${displayViewport.height}px`

        const task = target.render({ canvas, viewport: renderViewport })
        renderTaskRef.current = task

        try {
          await withTimeout(
            task.promise,
            RENDER_TIMEOUT_MS,
            '쪽을 그리는 데 시간이 너무 오래 걸립니다',
          )
        } catch (caught) {
          // 취소는 정상적인 흐름이다(쪽 이동이나 창 크기 변경).
          if ((caught as { name?: string }).name !== 'RenderingCancelledException') {
            console.error('PDF 쪽 그리기 실패', caught)
            if (generation === generationRef.current) {
              setError('이 화면을 그리지 못했습니다. 다른 브라우저로 다시 시도해 주세요.')
            }
          }
        }
      })

    renderChainRef.current = chained
  }, [page, fill])

  useEffect(() => {
    if (loading || error) return
    renderPage()
  }, [loading, error, renderPage])

  // 창 크기가 바뀌면 다시 그린다 — 발표 중 화면 회전이나 전체화면 전환.
  useEffect(() => {
    const container = containerRef.current
    if (!container || loading || error) return
    const observer = new ResizeObserver(() => renderPage())
    observer.observe(container)
    return () => observer.disconnect()
  }, [loading, error, renderPage])

  if (error) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        {error}
      </p>
    )
  }

  return (
    <div
      ref={containerRef}
      className={[
        'flex w-full flex-col items-center gap-3',
        fill ? 'h-full justify-center' : '',
      ].join(' ')}
    >
      {loading && <p className="text-sm text-muted">여는 중…</p>}

      <canvas ref={canvasRef} className="max-w-full rounded-lg" />

      {!hideControls && pageCount > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:opacity-30"
          >
            ← 이전
          </button>
          <span className="tabular-nums text-muted">
            {page} / {pageCount}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= pageCount}
            className="rounded-lg border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:opacity-30"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  )
}
