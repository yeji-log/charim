import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import SlideViewer from './SlideViewer'
import PresentationInk, { NO_CALLOUT_STYLE, PEN_COLORS } from './PresentationInk'
import {
  EMPTY_INK_STROKES,
  addInkStroke,
  clearInkForSlide,
  setCurrentSlide,
  setInkForSlide,
  startPresentation,
  stopPresentation,
  type PresentationState,
} from '../lib/presentation'
import { updateNote } from '../lib/slides'

/**
 * 교사용 발표 화면 — 전체화면.
 *
 * **"열기"와 "발표 시작"은 다른 일이다.** 이 화면을 여는 것만으로는 학생
 * 화면에 아무 영향이 없다 — 교사가 슬라이드를 미리 훑어보며 준비할 시간을
 * 준다. "이 쪽부터 발표 시작"을 눌러야 그때부터 학생 화면이 따라온다.
 *
 * **"닫기"는 방송을 끊지 않는다.** 열려 있는 창만 닫는다. 방송을 끊는 건
 * 발표 중일 때만 뜨는 "발표 끝내기"다. 닫아도 방송이 계속되므로, 창을 닫으면
 * 교사 화면에도 학생과 같은 전체화면이 뜨고 거기 "발표 제어하기" 버튼으로
 * 다시 돌아온다(SlideSection) — 창을 닫아도 발표가 안 끊겼다는 걸 스스로
 * 확인할 수 있다.
 *
 * 펜/지우개는 **방송이 실제로 시작된 뒤에만** 쓸 수 있다. addInkStroke 가
 * updateDoc 이라 Firestore 문서가 없으면(한 번도 시작 안 한 수업) 실패한다.
 */
export default function SlidePresenter({
  activityId,
  pptxFile,
  pdfFile,
  presentation,
  initialBrowsePage,
  notes,
  onBrowsePageChange,
  onNoteSaved,
  onClose,
}: {
  activityId: string
  pptxFile: Blob | null
  pdfFile: Blob | null
  presentation: PresentationState
  /** 방송 중이 아닐 때 어느 쪽부터 훑어볼지 — 보통 지난번에 끝낸 자리. */
  initialBrowsePage: number
  notes: string[]
  onBrowsePageChange: (page: number) => void
  onNoteSaved: (slide: number, text: string) => void
  onClose: () => void
}) {
  const active = presentation.active
  const [pageCount, setPageCount] = useState(0)
  const [browsing, setBrowsing] = useState(initialBrowsePage)
  const slide = active ? presentation.currentSlide : browsing

  const [noteDraft, setNoteDraft] = useState(notes[slide - 1] ?? '')
  const [penActive, setPenActive] = useState(false)
  const [tool, setTool] = useState<'draw' | 'erase'>('draw')
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].hex)
  const currentSlideInk = presentation.ink?.[slide] ?? EMPTY_INK_STROKES

  const saveTimerRef = useRef<number | undefined>(undefined)
  const pendingRef = useRef<{ slide: number; text: string } | null>(null)
  // effect 안에서 최신 notes 를 읽기 위한 것 — notes 를 의존성에 넣으면
  // 저장이 돌아올 때마다 효과가 다시 돌면서 입력 중인 발표자 노트를 덮어쓴다.
  const notesRef = useRef(notes)
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  // 방송이 꺼지면(다른 기기에서 끝냈을 수도 있다) 펜도 자동으로 끈다 —
  // 방송 없이는 그릴 대상이 없다.
  useEffect(() => {
    if (!active) setPenActive(false)
  }, [active])

  // 방송 중에는 훑어보기 쪽(browsing)도 지금 쪽을 따라가게 둔다.
  //
  // slide 는 active 일 때 presentation.currentSlide 를, 아닐 때 browsing 을
  // 본다. browsing 을 창 열 때 값 그대로 두면 "발표 끝내기"를 누르는 순간
  // 화면이 창을 열었던 쪽으로 튄다 — 12쪽을 설명하다 끝냈는데 3쪽이 뜨는
  // 식이다. 끝낸 자리가 그대로 남아 있어야 이어서 설명할 수 있고, "이 쪽부터
  // 발표 시작"도 그 자리에서 재개된다.
  useEffect(() => {
    if (active) setBrowsing(presentation.currentSlide)
  }, [active, presentation.currentSlide])

  function flushPending() {
    if (!pendingRef.current) return
    window.clearTimeout(saveTimerRef.current)
    const { slide: pendingSlide, text } = pendingRef.current
    pendingRef.current = null
    void updateNote(activityId, pendingSlide, text).catch((caught) =>
      console.error('발표자 노트 저장 실패', caught),
    )
    onNoteSaved(pendingSlide, text)
  }

  // 슬라이드가 바뀌면 이전 쪽의 미저장 편집을 흘려보내고 새 쪽 발표자 노트를 띄운다.
  useEffect(() => {
    flushPending()
    setNoteDraft(notesRef.current[slide - 1] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide])

  // 창이 사라질 때도 마지막으로 한 번.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flushPending(), [])

  function go(next: number) {
    flushPending()
    const clamped = Math.max(1, Math.min(pageCount || next, next))
    if (active) {
      void setCurrentSlide(activityId, clamped)
    } else {
      setBrowsing(clamped)
      onBrowsePageChange(clamped)
    }
  }

  function handleNoteChange(text: string) {
    setNoteDraft(text)
    pendingRef.current = { slide, text }
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(flushPending, 600)
  }

  // 방향키·Space 로 넘긴다. 리모컨(프레젠터)도 대개 이 신호를 보낸다.
  // **발표자 노트를 타이핑하는 중에는 가로채면 안 된다** — 스페이스를 치면 슬라이드가
  // 그냥 넘어가 버린다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' || target?.isContentEditable
      if (typing) return

      if (event.key === 'Escape') return onClose()
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault()
        go(slide + 1)
      }
      if (['ArrowLeft', 'PageUp'].includes(event.key)) {
        event.preventDefault()
        go(slide - 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, active, pageCount])

  const toolButton = (on: boolean) =>
    on
      ? 'rounded-lg border border-white bg-white px-2.5 py-1.5 text-sm font-semibold text-[#0f1720]'
      : 'rounded-lg border border-white/20 px-2.5 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10'

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1720] text-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="font-bold">
          {active ? `발표 중 · ${slide} / ${pageCount || '?'}` : `미리보기 · ${slide} / ${pageCount || '?'}`}
        </span>
        <span className="text-sm text-white/50">
          {active ? '학생 화면이 따라오고 있습니다' : '아직 학생 화면엔 보이지 않습니다'}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {active ? (
            <>
              <button
                onClick={() => setPenActive((current) => !current)}
                aria-pressed={penActive}
                style={NO_CALLOUT_STYLE}
                className={toolButton(penActive)}
              >
                펜 {penActive ? '끄기' : '켜기'}
              </button>

              {penActive && (
                <div className="flex items-center gap-1" role="group" aria-label="펜/지우개">
                  <button onClick={() => setTool('draw')} aria-pressed={tool === 'draw'} style={NO_CALLOUT_STYLE} className={toolButton(tool === 'draw')}>
                    그리기
                  </button>
                  <button onClick={() => setTool('erase')} aria-pressed={tool === 'erase'} style={NO_CALLOUT_STYLE} className={toolButton(tool === 'erase')}>
                    지우개
                  </button>
                </div>
              )}

              {penActive && tool === 'draw' && (
                <div className="flex items-center gap-1" role="group" aria-label="펜 색">
                  {PEN_COLORS.map((entry) => (
                    <button
                      key={entry.hex}
                      onClick={() => setPenColor(entry.hex)}
                      aria-label={entry.name}
                      aria-pressed={penColor === entry.hex}
                      style={{ backgroundColor: entry.hex, ...NO_CALLOUT_STYLE }}
                      className={[
                        'size-6 shrink-0 rounded-full ring-offset-2 ring-offset-[#0f1720] transition-shadow',
                        penColor === entry.hex ? 'ring-2 ring-white' : 'ring-1 ring-white/30',
                      ].join(' ')}
                    />
                  ))}
                </div>
              )}

              {penActive && (
                <button
                  onClick={() => void clearInkForSlide(activityId, slide)}
                  disabled={currentSlideInk.length === 0}
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
                >
                  전체 지우기
                </button>
              )}

              <button
                onClick={() => void stopPresentation(activityId)}
                className="rounded-lg bg-error px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
              >
                발표 끝내기
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                flushPending()
                void startPresentation(activityId, browsing)
              }}
              className="rounded-lg bg-success px-4 py-1.5 text-sm font-bold text-white transition-colors hover:opacity-90"
            >
              이 쪽부터 발표 시작
            </button>
          )}

          <button
            onClick={() => {
              flushPending()
              onClose()
            }}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10"
          >
            닫기
          </button>
        </div>
      </header>

      {/* 펜이 켜져 있는 동안은 발표자 노트보다 그릴 공간이 급하다 — 발표자 노트 패널을
          잠시 접고 슬라이드가 전체 폭을 쓰게 한다. */}
      <div
        className={
          penActive
            ? 'flex min-h-0 flex-1 flex-col p-3'
            : 'grid min-h-0 flex-1 gap-4 overflow-y-auto p-3 lg:grid-cols-[3fr_2fr]'
        }
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <SlideViewer
            pptxFile={pptxFile}
            pdfFile={pdfFile}
            page={slide}
            onPageCountChange={setPageCount}
            hideControls
            fill
            overlay={
              <PresentationInk
                strokes={currentSlideInk}
                editable
                active={active && penActive}
                mode={tool}
                color={penColor}
                onStrokeComplete={(stroke) =>
                  void addInkStroke(activityId, slide, stroke).catch((caught) =>
                    console.error('획 저장 실패', caught),
                  )
                }
                onEraseComplete={(remaining) =>
                  void setInkForSlide(activityId, slide, remaining).catch((caught) =>
                    console.error('지우기 저장 실패', caught),
                  )
                }
              />
            }
          />
        </div>

        {!penActive && (
          <div className="flex flex-col gap-1.5">
            {/* 한때 여기에 "개인정보는 적지 마세요"를 붙여뒀었다. slides 문서가
                공개 읽기라 화면에만 안 뜰 뿐 개발자도구로는 조회됐기 때문이다.
                지금은 그 문서의 읽기가 isMember() 로 좁혀져 규칙이 실제로 막으므로
                경고를 뺐다 — 막아놓고도 겁을 주면 교사가 발표자 노트를 안 쓴다.
                **slides 문서 읽기를 다시 공개로 열면 이 경고를 되살릴 것.** */}
            <label className="text-sm font-semibold text-white/70">
              발표자 노트 <span className="font-normal text-white/40">(학생 화면엔 안 보입니다)</span>
            </label>
            <textarea
              value={noteDraft}
              onChange={(event) => handleNoteChange(event.target.value)}
              onBlur={flushPending}
              placeholder="PPT 에 발표자 노트가 없으면 여기 바로 적어도 됩니다."
              className="min-h-[30vh] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-white/40"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-white/10 px-4 py-3">
        <button
          onClick={() => go(slide - 1)}
          disabled={slide <= 1}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
        >
          ← 이전
        </button>
        <span className="tabular-nums text-sm font-semibold text-white/80">
          {slide} / {pageCount || '?'}
        </span>
        <button
          onClick={() => go(slide + 1)}
          disabled={pageCount > 0 && slide >= pageCount}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-30"
        >
          다음 →
        </button>
        <span className="text-xs text-white/40">← → 또는 Space · Esc 로 닫기</span>
      </div>
    </div>,
    document.body,
  )
}
