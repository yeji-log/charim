import { useEffect, useRef, useState } from 'react'

import SlideViewer from './SlideViewer'
import { subscribePresentation, type PresentationState } from '../lib/presentation'
import { getSlidePdfFile, getSlidePptxFile, getSlideSet } from '../lib/slides'

/**
 * 수업 상세에 들어가는 수업자료 항목(kind: 'slides').
 *
 * 발표가 켜져 있으면 **전체화면으로 덮고 교사가 넘기는 쪽을 그대로 따라간다.**
 * 꺼져 있으면 그냥 자기 페이스로 넘겨보는 뷰어다.
 *
 * 파일은 무겁다(최대 25MB, base64 로 더 커진다). 그래서 이 항목이 화면에
 * 나타날 때 메타데이터만 먼저 읽고, 실제 파일은 학생이 "수업 자료 보기"를
 * 누르거나 발표가 시작될 때만 내려받는다 — 수업 내용을 글만 읽으러 들어온
 * 학생이 25MB 를 받게 하면 안 된다.
 */
export default function SlideSection({ activityId }: { activityId: string }) {
  const [has, setHas] = useState<{ pptx: boolean; pdf: boolean } | null>(null)
  const [files, setFiles] = useState<{ pptx: Blob | null; pdf: Blob | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [presentation, setPresentation] = useState<PresentationState | null>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    getSlideSet(activityId)
      .then((set) => {
        if (!cancelled) setHas({ pptx: !!set.pptx, pdf: !!set.pdf })
      })
      .catch((caught) => {
        console.error('수업 자료 확인 실패', caught)
        if (!cancelled) setHas({ pptx: false, pdf: false })
      })
    return () => {
      cancelled = true
    }
  }, [activityId])

  useEffect(() => {
    return subscribePresentation(activityId, setPresentation)
  }, [activityId])

  const hasAny = has?.pptx || has?.pdf

  async function loadFiles() {
    if (loadingRef.current || files) return
    loadingRef.current = true
    setLoading(true)
    try {
      const [pptx, pdf] = await Promise.all([
        has?.pptx ? getSlidePptxFile(activityId) : Promise.resolve(null),
        has?.pdf ? getSlidePdfFile(activityId) : Promise.resolve(null),
      ])
      setFiles({ pptx, pdf })
    } catch (caught) {
      console.error('수업 자료 불러오기 실패', caught)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }

  // 발표가 시작되면 학생이 아무것도 누르지 않아도 화면이 뜨게 한다.
  useEffect(() => {
    if (presentation?.active && hasAny && !files) void loadFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentation?.active, hasAny])

  if (has === null) return <p className="text-sm text-muted">확인 중…</p>

  if (!hasAny) {
    return <p className="text-sm text-muted">아직 올라온 수업 자료가 없습니다.</p>
  }

  if (presentation?.active && files) {
    return (
      <>
        <p className="text-sm font-semibold text-primary">
          발표 중입니다. 선생님 화면을 따라갑니다.
        </p>
        <PresentationOverlay
          pptxFile={files.pptx}
          pdfFile={files.pdf}
          slide={presentation.currentSlide}
        />
      </>
    )
  }

  if (!files) {
    return (
      <button
        onClick={loadFiles}
        disabled={loading}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
      >
        {loading ? '여는 중…' : '수업 자료 보기'}
      </button>
    )
  }

  return <SlideViewer pptxFile={files.pptx} pdfFile={files.pdf} />
}

/**
 * 발표 중 학생 화면 — 전체를 덮는다.
 *
 * 수업 내용의 다른 항목이 함께 보이면 학생이 스크롤하다 발표를 놓친다.
 * 넘기는 조작은 주지 않는다 — 교사 화면을 따라가는 것이 이 화면의 전부다.
 */
function PresentationOverlay({
  pptxFile,
  pdfFile,
  slide,
}: {
  pptxFile: Blob | null
  pdfFile: Blob | null
  slide: number
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0f1720] p-4">
      <div className="flex w-full max-w-6xl justify-center">
        <SlideViewer pptxFile={pptxFile} pdfFile={pdfFile} page={slide} hideControls />
      </div>
      <p className="text-sm text-white/60">{slide} 쪽 · 선생님이 넘기면 따라갑니다</p>
    </div>
  )
}
