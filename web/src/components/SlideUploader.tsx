import { useEffect, useRef, useState } from 'react'

import { formatSize } from '../lib/chunkedFile'
import {
  MAX_SLIDE_FILE_SIZE,
  SlideValidationError,
  deleteSlidePdf,
  deleteSlidePptx,
  getSlideSet,
  saveNotes,
  uploadSlidePdf,
  uploadSlidePptx,
  type SlideSet,
} from '../lib/slides'

const ghost =
  'rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50'

/**
 * 수업자료 올리기 — 수업 편집 안의 "수업자료" 항목 자리에 들어간다.
 *
 * PPT 와 PDF 를 따로 받는다. **둘 다 올리는 걸 권한다:**
 * - PPT 를 올리면 발표자 노트를 자동으로 뽑아 대본을 채워준다
 * - PDF 는 PPT 렌더링이 깨졌을 때 대신 보여줄 안전망이다(slides.ts 참고)
 */
export default function SlideUploader({ activityId }: { activityId: string }) {
  const [set, setSet] = useState<SlideSet | null>(null)
  const [busy, setBusy] = useState<'pptx' | 'pdf' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pptxRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSlideSet(activityId)
      .then(setSet)
      .catch((caught) => {
        console.error('수업 자료 확인 실패', caught)
        setSet({ pptx: null, pdf: null })
      })
  }, [activityId])

  async function uploadPptx() {
    const file = pptxRef.current?.files?.[0]
    if (!file) return
    setBusy('pptx')
    setError(null)
    setMessage(null)
    try {
      const meta = await uploadSlidePptx(activityId, file)
      setSet((prev) => ({ pptx: meta, pdf: prev?.pdf ?? null }))
      if (pptxRef.current) pptxRef.current.value = ''

      // 노트 추출은 실패해도 업로드 자체는 성공으로 둔다 — 노트가 없는 PPT 도
      // 있고, 그것 때문에 올린 파일을 되돌릴 이유가 없다.
      try {
        const { extractNotesFromPptx } = await import('../lib/pptxNotes')
        const notes = await extractNotesFromPptx(file)
        await saveNotes(activityId, notes)
        const filled = notes.filter((note) => note.trim()).length
        setMessage(
          filled > 0
            ? `올렸습니다. 발표자 노트 ${filled}쪽 분을 대본으로 가져왔습니다.`
            : '올렸습니다. PPT 에 발표자 노트가 없어 대본은 비어 있습니다.',
        )
      } catch (caught) {
        console.error('발표자 노트 추출 실패', caught)
        setMessage('올렸습니다. 다만 발표자 노트는 가져오지 못했습니다.')
      }
    } catch (caught) {
      setError(
        caught instanceof SlideValidationError ? caught.message : '올리지 못했습니다.',
      )
      if (!(caught instanceof SlideValidationError)) console.error('PPT 올리기 실패', caught)
    } finally {
      setBusy(null)
    }
  }

  async function uploadPdf() {
    const file = pdfRef.current?.files?.[0]
    if (!file) return
    setBusy('pdf')
    setError(null)
    setMessage(null)
    try {
      const meta = await uploadSlidePdf(activityId, file)
      setSet((prev) => ({ pptx: prev?.pptx ?? null, pdf: meta }))
      if (pdfRef.current) pdfRef.current.value = ''
      setMessage('올렸습니다.')
    } catch (caught) {
      setError(caught instanceof SlideValidationError ? caught.message : '올리지 못했습니다.')
      if (!(caught instanceof SlideValidationError)) console.error('PDF 올리기 실패', caught)
    } finally {
      setBusy(null)
    }
  }

  async function remove(which: 'pptx' | 'pdf') {
    if (!window.confirm(`${which === 'pptx' ? 'PPT' : 'PDF'} 를 지웁니다.`)) return
    try {
      if (which === 'pptx') await deleteSlidePptx(activityId)
      else await deleteSlidePdf(activityId)
      setSet((prev) => ({
        pptx: which === 'pptx' ? null : (prev?.pptx ?? null),
        pdf: which === 'pdf' ? null : (prev?.pdf ?? null),
      }))
    } catch (caught) {
      console.error('수업 자료 삭제 실패', caught)
      setError('지우지 못했습니다.')
    }
  }

  if (!set) return <p className="mt-2 text-sm text-muted">확인 중…</p>

  return (
    <div className="mt-2 flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-muted">
        수업 시간에 <strong className="text-text">화면에 띄울</strong> 자료입니다. 학생이
        내려받게 하려면 과목의 <strong className="text-text">자료</strong> 탭에 올려 주세요.
      </p>
      <p className="text-xs leading-relaxed text-muted">
        PPT 와 PDF 를 함께 올리는 것을 권합니다. PPT 에서는 발표자 노트를 대본으로 가져오고,
        PDF 는 PPT 미리보기가 깨졌을 때 대신 보여줍니다. 최대{' '}
        {formatSize(MAX_SLIDE_FILE_SIZE)}.
      </p>

      <SlideRow
        label="PPT"
        meta={set.pptx}
        inputRef={pptxRef}
        accept=".pptx"
        busy={busy === 'pptx'}
        onUpload={uploadPptx}
        onRemove={() => remove('pptx')}
      />
      <SlideRow
        label="PDF"
        meta={set.pdf}
        inputRef={pdfRef}
        accept=".pdf"
        busy={busy === 'pdf'}
        onUpload={uploadPdf}
        onRemove={() => remove('pdf')}
      />

      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  )
}

function SlideRow({
  label,
  meta,
  inputRef,
  accept,
  busy,
  onUpload,
  onRemove,
}: {
  label: string
  meta: { filename: string; size: number } | null
  inputRef: React.RefObject<HTMLInputElement | null>
  accept: string
  busy: boolean
  onUpload: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text">{label}</span>
        {meta ? (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">
              {meta.filename} · {formatSize(meta.size)}
            </span>
            <button onClick={onRemove} className="shrink-0 text-xs text-muted hover:text-error">
              지우기
            </button>
          </>
        ) : (
          <span className="text-xs text-muted">아직 없음</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept={accept} className="min-w-0 text-xs text-muted" />
        <button onClick={onUpload} disabled={busy} className={ghost}>
          {busy ? '올리는 중…' : meta ? '바꾸기' : '올리기'}
        </button>
      </div>
    </div>
  )
}
