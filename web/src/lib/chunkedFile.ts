import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore'

import { db } from './firebase'

/**
 * 파일을 Firestore 문서 조각으로 나눠 저장한다.
 *
 * ── 왜 Cloud Storage 를 안 쓰는가 ──
 * 파일은 원래 Storage 가 맡을 일이지만, Firebase 새 프로젝트에서 Storage 를
 * 켜려면 유료(Blaze) 플랜이 필요하다. "서버 비용 0원" 원칙을 지키려고
 * Firestore 에 넣는다.
 *
 * Firestore 는 문서 하나가 1MiB 를 넘을 수 없으므로 조각낸다.
 *
 *   {fileDoc}              ← 파일명·크기 같은 메타데이터
 *   {fileDoc}/chunks/{n}   ← 내용 (base64 조각)
 *
 * 나중에 Blaze 로 올려 Storage 를 쓰게 되면 **이 파일 하나만** 고치면 된다.
 * 화면은 물론 materials.ts 도 여기를 거쳐서만 파일을 만진다 — 데이터 계층을
 * 얇게 유지하는 게 그때의 이사 비용을 정한다.
 *
 * CHICODE 는 materials.ts 안에 같은 로직이 한 벌 더 있었다(먼저 만든 쪽을
 * 손대지 않으려고 복사했다). 차림은 처음부터 이 파일로 합친다.
 */

export interface ChunkedFileMeta {
  filename: string
  mimeType: string
  size: number
  chunkCount: number
  uploadedAt: number
}

/**
 * 조각 하나에 담을 원본 바이트 수.
 *
 * base64 는 원본의 약 1.34배가 되므로 512KB → 약 683KB 로, Firestore 문서
 * 1MiB 제한 안에 들어간다. 이 팽창률은 저장 용량에도 그대로 적용된다 —
 * 무료 플랜 1GiB 한도를 계산할 때 원본 크기가 아니라 1.34배로 잡아야 한다.
 */
const CHUNK_BYTES = 512 * 1024

/** base64 로 부풀기 전 원본 기준 상한. 한 파일이 무료 한도를 잠식하지 않도록. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 조각을 먼저 올리고 메타데이터를 마지막에 쓴다.
 *
 * 순서가 중요하다. 도중에 실패해도 메타가 없으면 "파일 있음" 취급을 하지
 * 않으므로, 학생이 반쪽짜리 파일을 여는 일이 없다.
 */
export async function saveChunkedFile(
  fileDoc: DocumentReference,
  file: File,
  extra?: Record<string, unknown>,
): Promise<ChunkedFileMeta> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunks = splitIntoBase64Chunks(bytes, CHUNK_BYTES)

  const meta: ChunkedFileMeta = {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    chunkCount: chunks.length,
    uploadedAt: Date.now(),
  }

  const batch = writeBatch(db)
  chunks.forEach((data, index) => {
    batch.set(doc(collection(fileDoc, 'chunks'), String(index)), { data })
  })
  await batch.commit()
  await setDoc(fileDoc, { ...meta, ...extra })

  return meta
}

/**
 * 메타데이터만 읽는다 — 조각은 건드리지 않는다.
 *
 * "파일이 붙어 있나, 이름이 뭔가"만 알면 되는 화면이 쓴다. 20MB 짜리를
 * 통째로 내려받아 놓고 파일명만 쓰는 일이 없게 한다.
 */
export async function getChunkedFileMeta(
  fileDoc: DocumentReference,
): Promise<ChunkedFileMeta | null> {
  const snapshot = await getDoc(fileDoc)
  return snapshot.exists() ? (snapshot.data() as ChunkedFileMeta) : null
}

/** 조각을 순서대로 읽어 하나의 Blob 으로 되돌린다. */
export async function loadChunkedFile(fileDoc: DocumentReference): Promise<Blob | null> {
  const metaSnapshot = await getDoc(fileDoc)
  if (!metaSnapshot.exists()) return null

  const meta = metaSnapshot.data() as ChunkedFileMeta
  const chunkSnapshot = await getDocs(collection(fileDoc, 'chunks'))

  // 조각은 병렬로 도착하므로 문서 id(= 조각 번호)를 인덱스로 써서 제자리에
  // 꽂는다. 하나라도 비면 붙이지 않고 실패시킨다 — 잘린 파일을 넘겨주면
  // 열리기는 하는데 내용이 깨져서 원인을 찾기 어렵다.
  const parts: (Uint8Array | undefined)[] = Array.from({ length: meta.chunkCount })
  for (const entry of chunkSnapshot.docs) {
    parts[Number(entry.id)] = base64ToBytes(entry.data().data as string)
  }
  if (parts.some((part) => part === undefined)) {
    throw new Error('파일 일부를 불러오지 못했습니다. 다시 시도해 주세요.')
  }

  return new Blob(parts as BlobPart[], { type: meta.mimeType })
}

/**
 * 메타 문서를 먼저 지운다. 조각 삭제가 중간에 끊겨도 목록에서는 사라진다.
 *
 * 조각을 안 지우고 메타만 지우면 용량이 그대로 남는다 — 무료 1GiB 한도에서는
 * 치명적이라 반드시 둘 다 지워야 한다.
 */
export async function deleteChunkedFile(fileDoc: DocumentReference): Promise<void> {
  await deleteDoc(fileDoc)
  const chunkSnapshot = await getDocs(collection(fileDoc, 'chunks'))
  if (chunkSnapshot.empty) return
  const batch = writeBatch(db)
  chunkSnapshot.docs.forEach((entry) => batch.delete(entry.ref))
  await batch.commit()
}

function splitIntoBase64Chunks(bytes: Uint8Array, chunkBytes: number): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    chunks.push(bytesToBase64(bytes.subarray(offset, offset + chunkBytes)))
  }
  return chunks.length > 0 ? chunks : ['']
}

/**
 * btoa 는 문자열을 받으므로 바이트를 먼저 문자열로 만들어야 한다.
 * String.fromCharCode 에 배열을 통째로 넘기면 인자 수 한계에 걸리므로 잘라서 넘긴다.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const BLOCK = 8192
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BLOCK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BLOCK))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
