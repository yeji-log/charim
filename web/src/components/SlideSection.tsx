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
 *   교사가 제어 중  SlidePresenter 전체화면(발표자 노트·펜·조작)
 *
 * 교사가 발표 화면을 닫아도 방송은 계속되고, 그때 교사도 학생과 같은 화면을
 * 보게 된다 — 발표가 안 끊겼다는 걸 스스로 확인할 수 있고 "발표 제어하기"로
 * 언제든 돌아온다. 조작 수단이 발표 화면 안에만 있으면 창을 닫는 순간 학생
 * 화면이 발표에 묶인 채 되돌릴 수 없다.
 *
 * 파일은 항목이 화면에 나타나면 **바로 내려받는다.** 예전엔 "수업 자료 보기"
 * 버튼을 눌러야 했는데, 수업 중에 한 번 더 누르게 하는 비용이 더 크다.
 */
export default function SlideSection({
  activityId,
  title,
}: {
  activityId: string
  /** 항목 제목("수업자료"). 발표 버튼과 한 줄에 놓으려고 여기서 그린다. */
  title?: string
}) {
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'
  /** 교사인지 아직 확인 중이면 (1) 판정을 미룬다 — 아래 효과 참고. */
  const authReady = authState !== 'loading'

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
        // 발표자 노트(notes)는 교사만 가져온다 — firestore.rules 가 이 문서 자체를
        // isMember() 로 막아뒀으니 학생이 읽으면 어차피 거부되지만, 거부될
        // 요청을 아예 보내지 않는 편이 깔끔하다.
        const [pptx, pdf, loadedNotes] = await Promise.all([
          exists.pptx ? getSlidePptxFile(activityId) : Promise.resolve(null),
          exists.pdf ? getSlidePdfFile(activityId) : Promise.resolve(null),
          isTeacher ? getNotes(activityId) : Promise.resolve([]),
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
  }, [activityId, isTeacher])

  useEffect(() => subscribePresentation(activityId, setPresentation), [activityId])

  /**
   * 훑어보기 쪽을 발표 상태에 맞춘다 — **딱 두 순간에만.**
   *
   * (1) 화면을 처음 열었을 때, **교사만.** currentSlide 는 지난번에 발표를
   *     끝낸 자리다(stopPresentation 이 이 값을 건드리지 않는다). 교사는 다음
   *     시간에 그 자리에서 이어서 시작하는 게 맞지만, 학생이 수업 뒤에 자료를
   *     복습하러 들어왔을 때 20쪽부터 뜨는 건 이상하다 — 학생은 1쪽부터다.
   *     CHICODE 는 여기서 교사·학생을 가르지 않았는데, 그건 교사 한 명이
   *     쓰는 서비스라 갈릴 일이 없었기 때문이다.
   * (2) 방송이 막 끝난 순간. **이건 학생에게도 적용한다.** 이게 없으면 발표를
   *     끝내는 순간 뒤에 깔려 있던 뷰어가 그대로 드러나는데, 학생 화면에서는
   *     그게 1쪽이다 — 12쪽을 설명하다 끝냈는데 모두의 화면이 1쪽으로 튄다.
   *
   * 방송 **중에는** 일부러 따라가지 않는다. 오버레이가 이미 덮고 있는데 뒤에
   * 깔린 뷰어까지 슬라이드마다 다시 그리면 넘길 때마다 PDF 렌더가 두 번씩
   * 돈다 — 갤럭시탭에서 그대로 버벅임이 된다.
   */
  const syncedOnce = useRef(false)
  const wasActive = useRef(false)
  useEffect(() => {
    // 멤버 확인이 끝나기 전에 판정하면 교사도 학생으로 잡힌다. 그 상태로
    // syncedOnce 를 세워버리면 (1)이 영영 안 일어난다 — 확인이 끝날 때까지
    // 아무것도 하지 않는다.
    if (!presentation || !authReady) return
    const justEnded = wasActive.current && !presentation.active
    const firstLoadForTeacher = !syncedOnce.current && isTeacher
    if (firstLoadForTeacher || justEnded) setBrowsePage(presentation.currentSlide)
    syncedOnce.current = true
    wasActive.current = presentation.active
  }, [presentation, isTeacher, authReady])

  /**
   * 제목과 발표 버튼을 한 줄에 둔다. 상태에 따라 오른쪽 내용만 바뀐다 —
   * 자료가 없거나 아직 여는 중이면 그 안내가, 준비되면 버튼이 들어간다.
   */
  const header = (right: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {title && <h2 className="text-lg font-bold text-text">{title}</h2>}
      {right}
    </div>
  )

  if (has === null) return header(<span className="text-sm text-muted">확인 중…</span>)

  if (!has.pptx && !has.pdf) {
    return header(<span className="text-sm text-muted">아직 올라온 수업 자료가 없습니다.</span>)
  }

  // 발표 상태가 도착하기 전에는 뷰어를 그리지 않는다. 먼저 그리면 1쪽으로
  // 마운트됐다가 진짜 쪽으로 튀는 깜빡임이 생긴다. 파일 내려받기가 더
  // 오래 걸려서 실제로는 이 대기가 눈에 띄지 않는다.
  if (!files || !presentation || !authReady) {
    return header(<span className="text-sm text-muted">여는 중…</span>)
  }

  const active = presentation.active

  return (
    <div className="flex flex-col gap-3">
      {header(
        isTeacher ? (
          <>
            {active && (
              <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                발표 중 · {presentation.currentSlide} 쪽
              </span>
            )}

            {/* 버튼은 오른쪽 끝으로 민다. 각 버튼에 ml-auto 를 걸면 좁은
                화면에서 줄이 바뀔 때 서로를 밀어내 흩어지므로 감싸는 div 에
                건다. */}
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
          </>
        ) : null,
      )}

      {/* 평소 뷰어. 발표 중에는 전체화면이 덮는다.
          page 를 넘겨 제어되는 뷰어로 쓴다 — 발표가 끝났을 때 방금 보여주던
          쪽에 그대로 남으려면 부모가 쪽을 들고 있어야 한다. 넘기는 조작은
          onPageChange 로 되돌아와 그대로 동작한다. */}
      <SlideViewer
        pptxFile={files.pptx}
        pdfFile={files.pdf}
        page={browsePage}
        onPageChange={setBrowsePage}
      />

      {active && !presenterOpen && (
        <PresentationOverlay
          pptxFile={files.pptx}
          pdfFile={files.pdf}
          slide={presentation.currentSlide}
          ink={presentation.ink}
          isTeacher={isTeacher}
          onTakeControl={() => setPresenterOpen(true)}
        />
      )}

      {presenterOpen && isTeacher && (
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
