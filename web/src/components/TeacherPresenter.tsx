import { useCallback, useEffect, useRef, useState } from 'react'

import SlideViewer from './SlideViewer'
import {
  setCurrentSlide,
  startPresentation,
  stopPresentation,
  subscribePresentation,
  type PresentationState,
} from '../lib/presentation'
import { getNotes, getSlidePdfFile, getSlidePptxFile, getSlideSet, updateNote } from '../lib/slides'

/**
 * 교사용 발표 제어.
 *
 * 발표를 시작하면 이 수업 화면을 보고 있는 모든 학생 기기가 교사가 넘기는 쪽을
 * 따라온다. **수업 하나당 발표 상태는 전역으로 하나뿐이다** — 학생이 로그인을
 * 하지 않아 반을 구분할 방법이 없어서다(presentation.ts 참고). 두 교실이 같은
 * 수업으로 동시에 발표하면 서로의 화면에 영향을 준다.
 *
 * 발표를 끌 때 현재 쪽을 지우지 않으므로, 다음에 시작하면 끝낸 자리에서
 * 이어진다 — 쉬는 시간에 껐다가 다시 켜는 흐름이 자연스럽다.
 */
export default function TeacherPresenter({ activityId }: { activityId: string }) {
  const [open, setOpen] = useState(false)
  const [hasSlides, setHasSlides] = useState<boolean | null>(null)
  const [state, setState] = useState<PresentationState | null>(null)

  useEffect(() => {
    getSlideSet(activityId)
      .then((set) => setHasSlides(!!set.pptx || !!set.pdf))
      .catch(() => setHasSlides(false))
  }, [activityId])

  useEffect(() => subscribePresentation(activityId, setState), [activityId])

  if (hasSlides === null) return null

  if (!hasSlides) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-2.5 text-sm text-muted">
        발표자료를 올리면 여기서 발표를 시작할 수 있습니다. 수업 편집 화면의 발표자료 항목에서
        올려 주세요.
      </p>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="text-sm font-semibold text-text">발표</span>
        {state?.active && (
          <span className="rounded-md bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
            진행 중 · {state.currentSlide} 쪽
          </span>
        )}
        <button
          onClick={() => setOpen(true)}
          className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          발표 화면 열기
        </button>
      </div>

      {open && (
        <PresenterOverlay
          activityId={activityId}
          state={state}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function PresenterOverlay({
  activityId,
  state,
  onClose,
}: {
  activityId: string
  state: PresentationState | null
  onClose: () => void
}) {
  const [files, setFiles] = useState<{ pptx: Blob | null; pdf: Blob | null } | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [pageCount, setPageCount] = useState(0)
  /** 발표를 아직 시작하지 않았을 때 교사가 훑어보는 쪽. */
  const [browsing, setBrowsing] = useState(state?.currentSlide ?? 1)
  const [noteDraft, setNoteDraft] = useState('')
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = state?.active ?? false
  const slide = active ? (state?.currentSlide ?? 1) : browsing

  useEffect(() => {
    let cancelled = false

    Promise.all([getSlideSet(activityId), getNotes(activityId)])
      .then(async ([set, loadedNotes]) => {
        const [pptx, pdf] = await Promise.all([
          set.pptx ? getSlidePptxFile(activityId) : Promise.resolve(null),
          set.pdf ? getSlidePdfFile(activityId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setFiles({ pptx, pdf })
        setNotes(loadedNotes)
      })
      .catch((caught) => {
        console.error('발표자료 불러오기 실패', caught)
        if (!cancelled) setFiles({ pptx: null, pdf: null })
      })

    return () => {
      cancelled = true
    }
  }, [activityId])

  useEffect(() => {
    setNoteDraft(notes[slide - 1] ?? '')
  }, [notes, slide])

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(pageCount || 1, next))
      if (active) void setCurrentSlide(activityId, clamped)
      else setBrowsing(clamped)
    },
    [active, activityId, pageCount],
  )

  // 키보드로 넘긴다 — 발표 중에 버튼을 겨냥해 누르는 것보다 빠르고, 리모컨
  // (프레젠터)도 대개 방향키/PageUp·Down 을 보낸다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
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
  }, [go, slide, onClose])

  /** 대본은 타이핑이 멈춘 뒤에 저장한다 — 글자마다 쓰면 무료 쓰기 한도를 태운다. */
  function editNote(text: string) {
    setNoteDraft(text)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => {
      void updateNote(activityId, slide, text).catch((caught) =>
        console.error('대본 저장 실패', caught),
      )
      setNotes((prev) => {
        const next = [...prev]
        while (next.length < slide) next.push('')
        next[slide - 1] = text
        return next
      })
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1720] text-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="font-bold">발표 화면</span>
        {active ? (
          <button
            onClick={() => void stopPresentation(activityId)}
            className="rounded-lg bg-error px-3 py-1.5 text-sm font-semibold text-white"
          >
            발표 끝내기
          </button>
        ) : (
          <button
            onClick={() => void startPresentation(activityId, browsing)}
            className="rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-white"
          >
            이 쪽부터 발표 시작
          </button>
        )}
        <span className="text-sm text-white/60">
          {active ? '학생 화면이 따라옵니다' : '아직 학생 화면은 바뀌지 않습니다'}
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/10"
        >
          닫기
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
          {files ? (
            <SlideViewer
              pptxFile={files.pptx}
              pdfFile={files.pdf}
              page={slide}
              onPageCountChange={setPageCount}
              hideControls
            />
          ) : (
            <p className="text-sm text-white/60">여는 중…</p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => go(slide - 1)}
              disabled={slide <= 1}
              className="rounded-lg border border-white/20 px-4 py-2 font-semibold text-white/80 hover:bg-white/10 disabled:opacity-30"
            >
              ← 이전
            </button>
            <span className="tabular-nums text-white/70">
              {slide} / {pageCount || '?'}
            </span>
            <button
              onClick={() => go(slide + 1)}
              disabled={pageCount > 0 && slide >= pageCount}
              className="rounded-lg border border-white/20 px-4 py-2 font-semibold text-white/80 hover:bg-white/10 disabled:opacity-30"
            >
              다음 →
            </button>
          </div>
          <p className="text-xs text-white/40">← → 또는 Space 로 넘길 수 있습니다</p>
        </div>

        <aside className="flex w-full min-w-0 flex-col gap-2 lg:max-w-sm">
          <span className="text-sm font-semibold text-white/70">대본 ({slide} 쪽)</span>
          <textarea
            value={noteDraft}
            onChange={(event) => editNote(event.target.value)}
            placeholder="이 쪽에서 할 말을 적어두세요. PPT 를 올리면 발표자 노트를 자동으로 가져옵니다."
            className="min-h-40 flex-1 rounded-xl border border-white/15 bg-white/5 p-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-white/40"
          />
          <span className="text-xs text-white/40">학생에게는 보이지 않습니다.</span>
        </aside>
      </div>
    </div>
  )
}
