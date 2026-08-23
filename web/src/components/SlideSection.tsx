import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '../auth/AuthProvider'
import SlideViewer from './SlideViewer'
import SlidePresenter from './SlidePresenter'
import PresentationInk from './PresentationInk'
import {
  EMPTY_INK_STROKES,
  stopPresentation,
  subscribePresentation,
  type PresentationState,
} from '../lib/presentation'
import { getNotes, getSlidePdfFile, getSlidePptxFile, getSlideSet } from '../lib/slides'

/**
 * 수업 상세의 수업자료 항목(kind: 'slides') — 뷰어와 발표를 함께 맡는다.
 *
 * 화면이 세 가지로 갈린다.
 *
 *   평소            그냥 넘겨보는 뷰어
 *   발표 중         전체화면 슬라이드(교사 화면도 같다) + 교사에게만
 *                   "발표 제어하기" 버튼
 *   교사가 제어 중  SlidePresenter 전체화면(대본·펜·조작)
 *
 * 교사가 발표 화면을 닫아도 방송은 계속되고, 그때 교사도 학생과 같은 화면을
 * 보게 된다 — 발표가 안 끊겼다는 걸 스스로 확인할 수 있고 "발표 제어하기"로
 * 언제든 돌아온다. 조작 수단이 발표 화면 안에만 있으면 창을 닫는 순간 학생
 * 화면이 발표에 묶인 채 되돌릴 수 없다.
 *
 * 파일은 항목이 화면에 나타나면 **바로 내려받는다.** 예전엔 "수업 자료 보기"
 * 버튼을 눌러야 했는데, 수업 중에 한 번 더 누르게 하는 비용이 더 크다.
 */
export default function SlideSection({ activityId }: { activityId: string }) {
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'

  const [has, setHas] = useState<{ pptx: boolean; pdf: boolean } | null>(null)
  const [files, setFiles] = useState<{ pptx: Blob | null; pdf: Blob | null } | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [presentation, setPresentation] = useState<PresentationState | null>(null)
  const [presenterOpen, setPresenterOpen] = useState(false)
  /** 방송 전 교사가 훑어보던 쪽 — 창을 닫았다 열어도 이어지도록 여기서 든다. */
  const [browsePage, setBrowsePage] = useState(1)
  const loadingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    getSlideSet(activityId)
      .then(async (set) => {
        if (cancelled) return
        const exists = { pptx: !!set.pptx, pdf: !!set.pdf }
        setHas(exists)
        if (!exists.pptx && !exists.pdf) return
        if (loadingRef.current) return

        loadingRef.current = true
        const [pptx, pdf, loadedNotes] = await Promise.all([
          exists.pptx ? getSlidePptxFile(activityId) : Promise.resolve(null),
          exists.pdf ? getSlidePdfFile(activityId) : Promise.resolve(null),
          getNotes(activityId),
        ])
        if (cancelled) return
        setFiles({ pptx, pdf })
        setNotes(loadedNotes)
      })
      .catch((caught) => {
        console.error('수업 자료 불러오기 실패', caught)
        if (!cancelled) setHas({ pptx: false, pdf: false })
      })
      .finally(() => {
        loadingRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [activityId])

  useEffect(() => subscribePresentation(activityId, setPresentation), [activityId])

  // 방송 중이면 지금 쪽을 기억해둔다 — 발표를 껐다 다시 켤 때 끝낸 자리에서
  // 이어지게 하려는 것이다.
  useEffect(() => {
    if (presentation?.active) setBrowsePage(presentation.currentSlide)
  }, [presentation?.active, presentation?.currentSlide])

  if (has === null) return <p className="text-sm text-muted">확인 중…</p>

  if (!has.pptx && !has.pdf) {
    return <p className="text-sm text-muted">아직 올라온 수업 자료가 없습니다.</p>
  }

  if (!files) return <p className="text-sm text-muted">여는 중…</p>

  const active = presentation?.active ?? false

  return (
    <div className="flex flex-col gap-3">
      {isTeacher && (
        <div className="flex flex-wrap items-center gap-2">
          {active && (
            <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
              발표 중 · {presentation?.currentSlide} 쪽
            </span>
          )}

          {/* 버튼은 오른쪽 끝으로 민다. 상태 배지는 왼쪽에 남는다 — 좁은
              화면에서 줄이 바뀌면 ml-auto 가 무의미해지므로 감싸는 div 에
              건다(각 버튼에 걸면 줄바꿈 시 서로 떨어진다). */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {active && (
              <button
                onClick={() => void stopPresentation(activityId)}
                className="rounded-lg border border-error px-3 py-2 text-sm font-semibold text-error transition-colors hover:bg-error hover:text-white"
              >
                발표 끝내기
              </button>
            )}
            <button
              onClick={() => setPresenterOpen(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              {active ? '발표 제어하기' : '발표 화면 열기'}
            </button>
          </div>
        </div>
      )}

      {/* 평소 뷰어. 발표 중에는 전체화면이 덮는다. */}
      <SlideViewer pptxFile={files.pptx} pdfFile={files.pdf} />

      {active && !presenterOpen && (
        <PresentationOverlay
          pptxFile={files.pptx}
          pdfFile={files.pdf}
          slide={presentation!.currentSlide}
          ink={presentation?.ink}
          isTeacher={isTeacher}
          onTakeControl={() => setPresenterOpen(true)}
        />
      )}

      {presenterOpen && isTeacher && presentation && (
        <SlidePresenter
          activityId={activityId}
          pptxFile={files.pptx}
          pdfFile={files.pdf}
          presentation={presentation}
          initialBrowsePage={browsePage}
          notes={notes}
          onBrowsePageChange={setBrowsePage}
          onNoteSaved={(slide, text) =>
            setNotes((prev) => {
              const next = [...prev]
              while (next.length < slide) next.push('')
              next[slide - 1] = text
              return next
            })
          }
          onClose={() => setPresenterOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * 발표 중 전체화면. 학생과, 발표를 직접 조작하지 않는 교사가 함께 본다.
 *
 * 조작 수단을 주지 않는다 — 교사 화면을 따라가는 것이 이 화면의 전부다.
 * 교사에게만 "발표 제어하기"가 뜬다.
 *
 * document.body 에 포털로 그린다. 조상 요소에 transform 같은 게 걸리면
 * position:fixed 가 그 요소를 기준으로 잡혀 화면을 안 덮는 경우가 있다.
 */
function PresentationOverlay({
  pptxFile,
  pdfFile,
  slide,
  ink,
  isTeacher,
  onTakeControl,
}: {
  pptxFile: Blob | null
  pdfFile: Blob | null
  slide: number
  ink?: PresentationState['ink']
  isTeacher: boolean
  onTakeControl: () => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-40 bg-[#0f1720]">
      {/* 슬라이드가 화면 전체를 쓴다 — 교실 뒤에서도 보여야 한다. */}
      <div className="absolute inset-0 p-1 sm:p-2">
        <SlideViewer
          pptxFile={pptxFile}
          pdfFile={pdfFile}
          page={slide}
          hideControls
          fill
          overlay={
            <PresentationInk
              strokes={ink?.[slide] ?? EMPTY_INK_STROKES}
              editable={false}
              active={false}
            />
          }
        />
      </div>

      {isTeacher ? (
        <button
          onClick={onTakeControl}
          className="absolute bottom-3 right-3 rounded-md border border-white/30 bg-[#0f1720]/80 px-2.5 py-1 text-xs font-semibold text-white/90 hover:bg-white/10"
        >
          발표 제어하기
        </button>
      ) : (
        <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-xs text-white/35">
          {slide} 쪽 · 선생님이 넘기면 따라갑니다
        </p>
      )}
    </div>,
    document.body,
  )
}
