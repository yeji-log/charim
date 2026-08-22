/**
 * 수업자료 데이터 계층.
 *
 * 화면은 이 파일의 함수만 호출한다. 파일 본문 저장은 chunkedFile.ts 에
 * 맡기므로, 나중에 Cloud Storage 로 옮길 때 손댈 곳은 그 파일 하나뿐이다.
 *
 *   workspaces/{wsId}/materials/{id}            메타데이터 + 파일 정보
 *   workspaces/{wsId}/materials/{id}/chunks/{n} 파일 내용 (base64 조각)
 *
 * 과목과는 `courseId` 필드로 연결한다. 과목의 하위 컬렉션으로 넣지 않은 이유는
 * 나중에 자료를 과목 밖(예: 학교 공용 자료)에도 두게 될 여지를 남기기 위해서다.
 */
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore'

import { db } from './firebase'
import {
  MAX_FILE_SIZE,
  deleteChunkedFile,
  formatSize,
  loadChunkedFile,
  saveChunkedFile,
} from './chunkedFile'
import { wsPath } from './workspace'

export { MAX_FILE_SIZE, formatSize }

export interface MaterialMeta {
  id: string
  title: string
  description: string
  filename: string
  mimeType: string
  size: number
  chunkCount: number
  createdAt: number
  /** 올린 교사의 uid. 남의 자료를 지우지 못하게 하는 기준이다. */
  ownerUid: string
  /** 어느 과목의 자료인지. 과목 핀 잠금의 기준이 된다. */
  courseId: string
}

export type MaterialKind = 'pdf' | 'image' | 'text' | 'archive' | 'other'

const ALLOWED_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'txt',
  'md',
  'csv',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'zip',
]

export class MaterialValidationError extends Error {}

const materialsRef = () => collection(db, ...wsPath('materials'))
const materialRef = (id: string) => doc(db, ...wsPath('materials', id))

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

export function kindOf(material: Pick<MaterialMeta, 'filename' | 'mimeType'>): MaterialKind {
  const ext = extensionOf(material.filename)
  if (ext === 'pdf' || material.mimeType === 'application/pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  if (['txt', 'md', 'csv'].includes(ext)) return 'text'
  if (ext === 'zip') return 'archive'
  return 'other'
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * 과목의 자료 목록.
 *
 * `where` 와 `orderBy(다른 필드)` 를 함께 쓰면 Firestore 가 복합 색인을
 * 요구한다. 색인을 만들지 않으려고 정렬은 여기서 직접 한다 — 한 과목의
 * 자료가 수천 개가 될 일은 없다.
 */
export async function listMaterials(courseId: string): Promise<MaterialMeta[]> {
  const snapshot = await getDocs(query(materialsRef(), where('courseId', '==', courseId)))
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }) as MaterialMeta)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function getMaterialFile(id: string): Promise<Blob | null> {
  return loadChunkedFile(materialRef(id))
}

export async function addMaterial(
  file: File,
  meta: { title?: string; description?: string; ownerUid: string; courseId: string },
): Promise<MaterialMeta> {
  const ext = extensionOf(file.name)

  // 화면에서 막는 것과 별개로 저장 직전에 한 번 더 본다. 진짜 방어선은
  // firestore.rules 이고, 이 검사는 사용자에게 이유를 알려주기 위한 것이다.
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new MaterialValidationError(
      `지원하지 않는 형식입니다 (.${ext || '확장자 없음'}). 허용: ${ALLOWED_EXTENSIONS.join(', ')}`,
    )
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new MaterialValidationError(
      `파일이 너무 큽니다 (${formatSize(file.size)}). 최대 ${formatSize(MAX_FILE_SIZE)} 까지 올릴 수 있습니다.`,
    )
  }

  const id = crypto.randomUUID()
  const extra = {
    title: meta.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
    description: meta.description?.trim() ?? '',
    createdAt: Date.now(),
    ownerUid: meta.ownerUid,
    courseId: meta.courseId,
  }
  const saved = await saveChunkedFile(materialRef(id), file, extra)

  return { id, ...extra, ...saved }
}

export async function deleteMaterial(id: string): Promise<void> {
  await deleteChunkedFile(materialRef(id))
}

/** 과목을 지울 때 그 과목의 자료도 전부 지운다 — 안 지우면 용량만 남는다. */
export async function deleteMaterialsOfCourse(courseId: string): Promise<void> {
  const materials = await listMaterials(courseId)
  for (const material of materials) {
    await deleteChunkedFile(materialRef(material.id))
  }
}

/** 메타 문서만 지운다(조각 없이 만들어진 문서 정리용). 평소엔 쓰지 않는다. */
export async function deleteMaterialMetaOnly(id: string): Promise<void> {
  await deleteDoc(materialRef(id))
}
