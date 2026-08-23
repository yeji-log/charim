/**
 * 수업자료(PPT / PDF) 데이터 계층 — 수업 시간에 화면에 띄우는 파일.
 *
 * 과목의 "자료" 탭(materials.ts, 학생이 내려받는 파일)과 이름이 비슷하지만
 * 다른 것이다. 이쪽은 화면에 띄우기만 하고 내려받을 수 없다.
 *
 * ── 왜 파일을 둘 받는가 ──
 * 브라우저에서 .pptx 를 직접 그리는 라이브러리(pptx-preview)는 신뢰하기 어렵다.
 * CHICODE 가 실제로 테스트했을 때 오류도 없이 빈 화면을 렌더링한 적이 있다.
 * 그래서 교사가 pptx 원본과 함께, 미리보기가 깨졌을 때 대신 보여줄 PDF 를
 * 같이 올릴 수 있게 한다. 학생 화면은 pptx 를 먼저 시도하고 실패하면 조용히
 * PDF 로 넘어간다(SlideViewer.tsx).
 *
 * PPT 를 올리는 값어치는 **발표자 노트를 자동으로 뽑아 주는 것**
 * 이다(pptxNotes.ts). 노트 추출은 렌더링과 달리 해석의 여지가 없는 XML 파싱이라
 * 믿을 만하다.
 *
 * ── 학생이 원본을 내려받지 못하게 한다 ──
 * 수업자료(materials.ts)와 달리 다운로드 링크를 **절대 만들지 않는다.** Blob 은
 * 화면에 그리는 용도로만 메모리에 올린다. 핀과 같은 수준의 "가벼운" 방지다 —
 * 화면 캡처까지 막을 수는 없다.
 *
 *   workspaces/{wsId}/slides/{activityId}             발표자 노트(슬라이드별 배열)
 *   workspaces/{wsId}/slides/{activityId}/files/pptx  PPT 원본 + chunks
 *   workspaces/{wsId}/slides/{activityId}/files/pdf   미리보기용 PDF + chunks
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'

import { db } from './firebase'
import {
  deleteChunkedFile,
  formatSize,
  loadChunkedFile,
  saveChunkedFile,
  type ChunkedFileMeta,
} from './chunkedFile'
import { wsPath } from './workspace'

export class SlideValidationError extends Error {}

/**
 * PPT 는 이미지가 많아 수업자료(10MB)보다 크게 잡되, 무료 플랜 총량(1GiB)을
 * 한 수업이 잠식하지 않도록 여전히 제한한다. base64 로 약 1.34배 부푸는 것도
 * 감안한 값이다 — 25MB 원본이 저장소에서는 약 34MB 다.
 */
export const MAX_SLIDE_FILE_SIZE = 25 * 1024 * 1024

const setDocRef = (activityId: string) => doc(db, ...wsPath('slides', activityId))
const pptxRef = (activityId: string) => doc(db, ...wsPath('slides', activityId, 'files', 'pptx'))
const pdfRef = (activityId: string) => doc(db, ...wsPath('slides', activityId, 'files', 'pdf'))

function assertExtension(file: File, ext: string) {
  if (!file.name.toLowerCase().endsWith(`.${ext}`)) {
    throw new SlideValidationError(`.${ext} 파일만 올릴 수 있습니다.`)
  }
}

function assertSize(file: File) {
  if (file.size > MAX_SLIDE_FILE_SIZE) {
    throw new SlideValidationError(
      `파일이 너무 큽니다 (${formatSize(file.size)}). 최대 ${formatSize(MAX_SLIDE_FILE_SIZE)} 까지 올릴 수 있습니다.`,
    )
  }
}

export interface SlideSet {
  pptx: ChunkedFileMeta | null
  pdf: ChunkedFileMeta | null
}

async function metaOf(ref: ReturnType<typeof pptxRef>): Promise<ChunkedFileMeta | null> {
  const snapshot = await getDoc(ref)
  return snapshot.exists() ? (snapshot.data() as ChunkedFileMeta) : null
}

export async function getSlideSet(activityId: string): Promise<SlideSet> {
  const [pptx, pdf] = await Promise.all([metaOf(pptxRef(activityId)), metaOf(pdfRef(activityId))])
  return { pptx, pdf }
}

export async function uploadSlidePptx(activityId: string, file: File): Promise<ChunkedFileMeta> {
  assertExtension(file, 'pptx')
  assertSize(file)
  return saveChunkedFile(pptxRef(activityId), file)
}

export async function uploadSlidePdf(activityId: string, file: File): Promise<ChunkedFileMeta> {
  assertExtension(file, 'pdf')
  assertSize(file)
  return saveChunkedFile(pdfRef(activityId), file)
}

export function getSlidePptxFile(activityId: string): Promise<Blob | null> {
  return loadChunkedFile(pptxRef(activityId))
}

export function getSlidePdfFile(activityId: string): Promise<Blob | null> {
  return loadChunkedFile(pdfRef(activityId))
}

export function deleteSlidePptx(activityId: string): Promise<void> {
  return deleteChunkedFile(pptxRef(activityId))
}

export function deleteSlidePdf(activityId: string): Promise<void> {
  return deleteChunkedFile(pdfRef(activityId))
}

/** 슬라이드 순서대로 발표자 노트. 아직 뽑은 적 없으면 빈 배열. */
export async function getNotes(activityId: string): Promise<string[]> {
  const snapshot = await getDoc(setDocRef(activityId))
  if (!snapshot.exists()) return []
  return (snapshot.data().notes as string[] | undefined) ?? []
}

export async function saveNotes(activityId: string, notes: string[]): Promise<void> {
  await setDoc(setDocRef(activityId), { notes }, { merge: true })
}

/** 슬라이드 하나의 발표자 노트만 고친다 — 발표 중에 손보는 용도. */
export async function updateNote(
  activityId: string,
  slideNumber: number,
  text: string,
): Promise<void> {
  const notes = await getNotes(activityId)
  while (notes.length < slideNumber) notes.push('')
  notes[slideNumber - 1] = text
  await saveNotes(activityId, notes)
}
