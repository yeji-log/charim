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

/**
 * 수업자료 올리기 — 수업 편집 안의 "수업자료" 항목 자리에 들어간다.
 *
 * **파일을 고르면 바로 올라간다.** 예전엔 파일을 고른 뒤 "올리기" 버튼을 따로
 * 눌러야 했는데, 편집창 아래에 있는 큰 "저장" 버튼을 누르고 올라간 줄 아는
 * 사고가 실제로 났다. 저장 버튼은 수업 내용만 저장하고 파일은 건드리지
 * 않는다 — 두 저장 동작이 한 화면에 있는 것 자체가 함정이라, 파일 쪽은
 * 버튼을 없애서 헷갈릴 여지를 지웠다.
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

  useEffect(() => {
    getSlideSet(activityId)
      .then(setSet)
      .catch((caught) => {
        console.error('수업 자료 확인 실패', caught)
        setSet({ pptx: null, pdf: null })
      })
  }, [activityId])

  async function handlePick(which: 'pptx' | 'pdf', file: File | undefined, reset: () => void) {
    if (!file) return
    setBusy(which)
    setError(null)
    setMessage(null)

    try {
      if (which === 'pptx') {
        const meta = await uploadSlidePptx(activityId, file)
        setSet((prev) => ({ pptx: meta, pdf: prev?.pdf ?? null }))

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
      } else {
        const meta = await uploadSlidePdf(activityId, file)
        setSet((prev) => ({ pptx: prev?.pptx ?? null, pdf: meta }))
        setMessage('올렸습니다.')
      }
      reset()
    } catch (caught) {
      setError(caught instanceof SlideValidationError ? caught.message : '올리지 못했습니다.')
      if (!(caught instanceof SlideValidationError)) console.error('수업 자료 올리기 실패', caught)
      reset()
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
      setMessage(null)
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
        accept=".pptx"
        meta={set.pptx}
        busy={busy === 'pptx'}
        onPick={(file, reset) => handlePick('pptx', file, reset)}
        onRemove={() => remove('pptx')}
      />
      <SlideRow
        label="PDF"
        accept=".pdf"
        meta={set.pdf}
        busy={busy === 'pdf'}
        onPick={(file, reset) => handlePick('pdf', file, reset)}
        onRemove={() => remove('pdf')}
      />

      {message && <p className="text-sm text-success">{message}</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      <p className="text-xs text-muted">
        파일은 고르는 즉시 올라갑니다. 아래 <strong className="text-text">저장</strong> 버튼은
        수업 내용(제목·항목)만 저장합니다.
      </p>
    </div>
  )
}

function SlideRow({
  label,
  accept,
  meta,
  busy,
  onPick,
  onRemove,
}: {
  label: string
  accept: string
  meta: { filename: string; size: number } | null
  busy: boolean
  onPick: (file: File | undefined, reset: () => void) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text">{label}</span>

        {busy ? (
          <span className="text-xs text-primary">올리는 중…</span>
        ) : meta ? (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">
              {meta.filename} · {formatSize(meta.size)}
            </span>
            <button onClick={onRemove} className="shrink-0 text-xs text-muted hover:text-error">
              지우기
            </button>
          </>
        ) : (
          <span className="flex-1 text-xs text-muted">아직 없음</span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={busy}
        // 같은 파일을 다시 고르면 change 가 안 뜨므로 올린 뒤 값을 비운다.
        onChange={(event) =>
          onPick(event.target.files?.[0], () => {
            if (inputRef.current) inputRef.current.value = ''
          })
        }
        className="min-w-0 text-xs text-muted disabled:opacity-50"
      />
    </div>
  )
}
