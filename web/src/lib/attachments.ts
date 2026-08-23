/**
 * 수업 내용의 **항목 하나에 붙이는 첨부파일** — 이미지·PDF·문서·짧은 동영상.
 *
 * 발표자료(slides.ts)와 성격이 다르다. 그쪽은 "학생이 원본을 못 받게" 하려고
 * 전용 뷰어를 만들었지만, 이건 그냥 나눠주는 자료라 막을 이유가 없다. 그래서
 * 훨씬 단순하다 — 이미지면 화면에 바로 띄우고, 나머지는 내려받기 링크 하나다.
 *
 *   workspaces/{wsId}/activities/{activityId}/attachments/{sectionId}
 *
 * **CHICODE 는 이걸 최상위 컬렉션(`labSectionFiles`)에 뒀는데 따라가지 않았다.**
 * CLAUDE.md 4절이 최상위 전역 컬렉션을 만들지 말라고 못박아 뒀고, 활동 밑에
 * 중첩해두면 활동을 지울 때 함께 지우기도 쉽다(lessons.ts 의 deleteActivity).
 *
 * 슬롯 키는 activityId + sectionId 다. `section.id` 는 교사가 항목을 만들 때
 * crypto.randomUUID() 로 한 번 정해지고 그 뒤로 안 바뀌므로, 항목을 지우지
 * 않는 한 첨부도 그대로 붙어 있다.
 */
import { collection, doc, getDocs } from 'firebase/firestore'

import {
  deleteChunkedFile,
  getChunkedFileMeta,
  loadChunkedFile,
  saveChunkedFile,
  type ChunkedFileMeta,
} from './chunkedFile'
import { db } from './firebase'
import { wsPath } from './workspace'

export class AttachmentError extends Error {}

/** base64 로 부풀기 전 원본 기준. 무료 1GiB 를 한 항목이 잠식하지 않도록. */
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024

/**
 * 동영상만 한도를 따로 둔다.
 *
 * Storage 가 아니라 Firestore 문서 조각으로 저장하는 구조라(chunkedFile.ts)
 * **스트리밍이 안 된다** — 재생 전에 전체를 내려받는다. 그래서 무한정 늘리지
 * 않고 "짧은 시연 클립" 정도로만 쓸 수 있게 잡았다. 긴 영상은 유튜브 링크를
 * 쓰는 편이 낫다(youtube.ts).
 */
const MAX_VIDEO_SIZE = 50 * 1024 * 1024

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const VIDEO_EXTENSIONS = ['mp4']
const ALLOWED_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  'pdf',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'csv',
  'txt',
]

export { MAX_ATTACHMENT_SIZE, MAX_VIDEO_SIZE, ALLOWED_EXTENSIONS }

const attachmentsRef = (activityId: string) =>
  collection(db, ...wsPath('activities', activityId, 'attachments'))

const attachmentRef = (activityId: string, sectionId: string) =>
  doc(db, ...wsPath('activities', activityId, 'attachments', sectionId))

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

export function isImage(meta: ChunkedFileMeta): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(meta.filename))
}

export function isVideo(meta: ChunkedFileMeta): boolean {
  return VIDEO_EXTENSIONS.includes(extensionOf(meta.filename))
}

function assertValid(file: File) {
  const ext = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AttachmentError(
      `지원하지 않는 형식입니다 (.${ext || '확장자 없음'}). 허용: 이미지 · mp4 · PDF · 한글 · 워드 · PPT · 엑셀 · CSV · txt`,
    )
  }
  const max = VIDEO_EXTENSIONS.includes(ext) ? MAX_VIDEO_SIZE : MAX_ATTACHMENT_SIZE
  if (file.size > max) {
    throw new AttachmentError(
      `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 ${max / 1024 / 1024}MB 까지 올릴 수 있습니다.`,
    )
  }
}

export async function uploadAttachment(
  activityId: string,
  sectionId: string,
  file: File,
): Promise<ChunkedFileMeta> {
  assertValid(file)
  return saveChunkedFile(attachmentRef(activityId, sectionId), file)
}

export function getAttachmentMeta(
  activityId: string,
  sectionId: string,
): Promise<ChunkedFileMeta | null> {
  return getChunkedFileMeta(attachmentRef(activityId, sectionId))
}

export function getAttachmentFile(activityId: string, sectionId: string): Promise<Blob | null> {
  return loadChunkedFile(attachmentRef(activityId, sectionId))
}

export function deleteAttachment(activityId: string, sectionId: string): Promise<void> {
  return deleteChunkedFile(attachmentRef(activityId, sectionId))
}

/**
 * 활동을 지울 때 그 활동의 첨부를 전부 치운다.
 *
 * 항목마다 슬롯이 하나씩이라 몇 개가 붙어 있는지 문서에서 알 수 없다 —
 * 하위 컬렉션을 훑어서 지운다. 안 지우면 조각이 통째로 남는다.
 */
export async function deleteAttachmentsOfActivity(activityId: string): Promise<void> {
  const snapshot = await getDocs(attachmentsRef(activityId))
  for (const entry of snapshot.docs) {
    await deleteChunkedFile(entry.ref)
  }
}
