import { useCallback, useEffect, useState } from 'react'

import { useCourse } from './CourseGate'
import {
  formatDate,
  formatSize,
  getMaterialFile,
  kindOf,
  listMaterials,
  type MaterialMeta,
} from '../lib/materials'

const KIND_LABEL: Record<ReturnType<typeof kindOf>, string> = {
  pdf: 'PDF',
  image: '이미지',
  text: '텍스트',
  archive: '압축',
  other: '파일',
}

/** 과목 안의 자료 목록. 게이트를 통과한 뒤에만 그려진다. */
export default function MaterialsList() {
  const { course } = useCourse()
  const [materials, setMaterials] = useState<MaterialMeta[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false

    listMaterials(course.id)
      .then((loaded) => {
        if (!cancelled) setMaterials(loaded)
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('자료 목록 불러오기 실패', caught)
        setLoadError(true)
      })

    return () => {
      cancelled = true
    }
  }, [course.id])

  if (loadError) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-error">
        자료를 불러오지 못했습니다. 새로고침해 주세요.
      </p>
    )
  }

  if (!materials) return <p className="text-muted">불러오는 중…</p>

  if (materials.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
        아직 올라온 자료가 없습니다.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {materials.map((material) => (
        <MaterialRow key={material.id} material={material} />
      ))}
    </ul>
  )
}

function MaterialRow({ material }: { material: MaterialMeta }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 파일은 Firestore 조각으로 흩어져 있어서 링크 하나로 받을 수 없다. 눌렀을
   * 때 조각을 모아 Blob 을 만들고, 그때 만든 임시 URL 로 내려받는다.
   *
   * revokeObjectURL 을 반드시 불러야 한다 — 안 부르면 파일 하나만큼의 메모리가
   * 탭이 닫힐 때까지 잡혀 있는다. 수업 중에 여러 개를 열면 쌓인다.
   */
  const download = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const blob = await getMaterialFile(material.id)
      if (!blob) {
        setError('파일을 찾을 수 없습니다.')
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = material.filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      console.error('자료 내려받기 실패', caught)
      setError('내려받지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }, [material.id, material.filename])

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="rounded-md bg-primary-tint px-2 py-1 text-xs font-bold text-primary-dark">
        {KIND_LABEL[kindOf(material)]}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-text">{material.title}</p>
        {material.description && (
          <p className="mt-0.5 truncate text-sm text-muted">{material.description}</p>
        )}
        <p className="mt-0.5 text-xs text-muted">
          {material.filename} · {formatSize(material.size)} · {formatDate(material.createdAt)}
        </p>
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
      </div>

      <button
        onClick={download}
        disabled={busy}
        className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '받는 중…' : '내려받기'}
      </button>
    </li>
  )
}
