import { useCallback, useEffect, useState } from 'react'

import {
  AttachmentError,
  MAX_ATTACHMENT_SIZE,
  MAX_VIDEO_SIZE,
  deleteAttachment,
  getAttachmentFile,
  getAttachmentMeta,
  isImage,
  isVideo,
  uploadAttachment,
} from '../lib/attachments'
import { formatSize, type ChunkedFileMeta } from '../lib/chunkedFile'

/**
 * 수업 내용 항목에 붙은 첨부파일 — 학생이 보는 쪽.
 *
 * 이미지는 바로 띄우고, 동영상은 플레이어로, 나머지는 내려받기 단추 하나다.
 *
 * **파일 본문은 열어볼 때 받는다.** 항목이 화면에 나타나면 메타(이름·크기)만
 * 먼저 읽고, 이미지·동영상일 때만 본문을 이어서 받는다. 문서·PDF 까지 미리
 * 받아두면 수업 내용 하나 여는 데 수십 MB 를 끌어오게 된다.
 *
 * blob: 주소는 화면을 떠날 때 반드시 되돌려준다. 안 그러면 탭을 켜둔 채
 * 여러 수업을 오갈수록 메모리가 쌓인다.
 */
export default function SectionAttachment({
  activityId,
  sectionId,
}: {
  activityId: string
  sectionId: string
}) {
  const [meta, setMeta] = useState<ChunkedFileMeta | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    getAttachmentMeta(activityId, sectionId)
      .then(async (found) => {
        if (cancelled) return
        if (!found) {
          setState('none')
          return
        }
        setMeta(found)

        // 화면에 그려야 하는 것만 본문을 받는다.
        if (isImage(found) || isVideo(found)) {
          const blob = await getAttachmentFile(activityId, sectionId)
          if (cancelled || !blob) return
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
        if (!cancelled) setState('ready')
      })
      .catch((caught) => {
        console.error('첨부파일 불러오기 실패', caught)
        if (!cancelled) setState('failed')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [activityId, sectionId])

  const download = useCallback(async () => {
    if (!meta) return
    const blob = url ? null : await getAttachmentFile(activityId, sectionId)
    const href = url ?? (blob ? URL.createObjectURL(blob) : null)
    if (!href) return

    const link = document.createElement('a')
    link.href = href
    link.download = meta.filename
    link.click()
    // 방금 만든 주소만 되돌려준다. url 은 이 컴포넌트가 계속 쓰는 것이라
    // 여기서 풀면 화면의 이미지가 깨진다.
    if (!url) URL.revokeObjectURL(href)
  }, [activityId, sectionId, meta, url])

  if (state === 'none') return null
  if (state === 'loading') return <p className="text-sm text-muted">첨부 여는 중…</p>
  if (state === 'failed' || !meta) {
    return <p className="text-sm text-error">첨부파일을 열지 못했습니다.</p>
  }

  if (isImage(meta) && url) {
    return (
      <img
        src={url}
        alt={meta.filename}
        className="max-h-[70vh] w-auto max-w-full rounded-xl border border-line"
      />
    )
  }

  if (isVideo(meta) && url) {
    return (
      <video
        src={url}
        controls
        className="max-h-[70vh] w-full max-w-2xl rounded-xl border border-line"
      />
    )
  }

  return (
    <button
      onClick={download}
      className="flex w-fit items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
    >
      {meta.filename}
      <span className="font-normal text-secondary">{formatSize(meta.size)}</span>
    </button>
  )
}

/**
 * 교사용 첨부 올리기·지우기.
 *
 * 붙어 있는지 여부는 부모(활동 편집)가 `section.hasAttachment` 로 들고 있다 —
 * 저장 버튼을 눌러야 활동 문서에 반영되므로, 여기서 파일을 올리자마자
 * onChange 로 알려 그 깃발을 맞춘다.
 */
export function SectionAttachmentEditor({
  activityId,
  sectionId,
  hasAttachment,
  onChange,
}: {
  activityId: string
  sectionId: string
  hasAttachment: boolean
  onChange: (has: boolean) => void
}) {
  const [meta, setMeta] = useState<ChunkedFileMeta | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!hasAttachment) {
      setMeta(null)
      return
    }
    getAttachmentMeta(activityId, sectionId)
      .then((found) => {
        if (!cancelled) setMeta(found)
      })
      .catch((caught) => console.error('첨부 확인 실패', caught))
    return () => {
      cancelled = true
    }
  }, [activityId, sectionId, hasAttachment])

  async function upload(file: File) {
    setBusy(true)
    setMessage(null)
    try {
      setMeta(await uploadAttachment(activityId, sectionId, file))
      onChange(true)
      setMessage('올렸습니다. 활동을 저장해야 학생에게 보입니다.')
    } catch (caught) {
      console.error('첨부 올리기 실패', caught)
      setMessage(
        caught instanceof AttachmentError ? caught.message : '올리지 못했습니다.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('첨부파일을 지웁니다. 되돌릴 수 없습니다.')) return
    setBusy(true)
    try {
      await deleteAttachment(activityId, sectionId)
      setMeta(null)
      onChange(false)
      setMessage('지웠습니다.')
    } catch (caught) {
      console.error('첨부 지우기 실패', caught)
      setMessage('지우지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text">첨부파일</span>

      {meta ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text">{meta.filename}</span>
          <span className="text-xs text-secondary">{formatSize(meta.size)}</span>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-muted transition-colors hover:border-error hover:text-error disabled:opacity-40"
          >
            지우기
          </button>
        </div>
      ) : (
        <input
          type="file"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            // 같은 파일을 다시 고를 수 있도록 값을 비운다 — 안 그러면
            // change 가 안 일어나 두 번째 시도가 조용히 무시된다.
            event.target.value = ''
            if (file) void upload(file)
          }}
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-muted"
        />
      )}

      <p className="text-xs text-muted">
        이미지·mp4·PDF·한글·워드·PPT·엑셀·CSV. 최대 {MAX_ATTACHMENT_SIZE / 1024 / 1024}MB
        (동영상은 {MAX_VIDEO_SIZE / 1024 / 1024}MB).
      </p>
      {message && <p className="text-xs text-muted">{message}</p>}
    </div>
  )
}
