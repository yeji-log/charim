/**
 * 과목 데이터 계층.
 *
 * CHICODE 의 `subjects` 를 `courses` 로 바꿨다 — 학교 맥락에서는 "과목"이
 * subject 보다 course 에 가깝고, 화면에서 쓰는 말도 그렇다.
 *
 * ── 핀번호는 "가벼운 잠금"이다 ──
 * 학생은 로그인이 없다. 학생 화면이 과목 이름조차 띄우려면 읽기를 열어둬야
 * 하고, 그러면 개발자도구로 Firestore 를 직접 열었을 때 핀 값도 함께 보인다.
 * 즉 이 핀은 보안 장치가 아니라 화면 진입을 막는 안내판이다. CHICODE 에서
 * 사용자가 알고 받아들인 트레이드오프이고 차림도 같다.
 *
 * **다음 세션이 이걸 몰래 "강화"하려고 하지 말 것.** 진짜 서버 검증은
 * Blaze 유료 플랜 + Cloud Functions 가 필요하고, 그건 "서버 비용 0원"
 * 원칙과 충돌한다.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { db } from './firebase'
import { deleteLessonsOf } from './lessons'
import { deleteMaterialsOfCourse } from './materials'
import { wsPath } from './workspace'

export interface CourseMeta {
  id: string
  name: string
  pin: string
  /** false 면 핀 없이 바로 열람. 수업 중 핀 오타로 시간을 잡아먹을 때 교사가
   *  그 자리에서 임시로 풀어주는 스위치다. */
  pinRequired: boolean
  /** false 면 준비 중. 학생 화면에 이름은 보이지만 들어갈 수 없다. */
  published: boolean
  order: number
  /** 새 창으로 여는 외부 링크(노션 등). */
  notionUrl: string
  /** 담당 교사. 다른 교사가 남의 과목을 고칠 수 없게 하는 기준이다. */
  ownerUid: string
}

const coursesRef = () => collection(db, ...wsPath('courses'))
const courseRef = (courseId: string) => doc(db, ...wsPath('courses', courseId))

/**
 * CHICODE 는 필드가 없는 옛 문서를 위해 정규화 함수를 뒀다(pinRequired 가
 * 없으면 "핀 필요", published 가 없으면 "이미 공개"). 차림은 처음부터
 * 만들므로 create 시 기본값을 명시적으로 넣는다 — 그래도 콘솔에서 손으로
 * 만든 문서가 섞일 수 있으니 읽을 때 한 번 더 메운다.
 */
function normalize(id: string, data: Record<string, unknown>): CourseMeta {
  return {
    id,
    name: (data.name as string) ?? '',
    pin: (data.pin as string) ?? '',
    pinRequired: data.pinRequired !== false,
    published: data.published !== false,
    order: (data.order as number) ?? 0,
    notionUrl: (data.notionUrl as string) ?? '',
    ownerUid: (data.ownerUid as string) ?? '',
  }
}

/** 학교 전체 과목. 정렬은 클라이언트에서 한다(복합 색인 회피). */
export async function listCourses(): Promise<CourseMeta[]> {
  const snapshot = await getDocs(coursesRef())
  return snapshot.docs
    .map((entry) => normalize(entry.id, entry.data()))
    .sort((a, b) => a.order - b.order)
}

/** 한 교사의 과목만. `/t/{슬러그}` 와 교사 페이지에서 쓴다. */
export async function listCoursesByTeacher(uid: string): Promise<CourseMeta[]> {
  const snapshot = await getDocs(query(coursesRef(), where('ownerUid', '==', uid)))
  return snapshot.docs
    .map((entry) => normalize(entry.id, entry.data()))
    .sort((a, b) => a.order - b.order)
}

export async function getCourse(courseId: string): Promise<CourseMeta | null> {
  const snapshot = await getDoc(courseRef(courseId))
  return snapshot.exists() ? normalize(snapshot.id, snapshot.data()) : null
}

export async function createCourse(uid: string, name: string): Promise<CourseMeta> {
  const mine = await listCoursesByTeacher(uid)
  const order = mine.reduce((max, entry) => Math.max(max, entry.order), -1) + 1
  const id = crypto.randomUUID()
  const course: Omit<CourseMeta, 'id'> = {
    name: name.trim(),
    pin: '',
    // 핀을 아직 안 정했으니 핀 요구를 켜두면 아무도 못 들어간다. 교사가 핀을
    // 넣는 순간 켜라고 화면에서 안내한다.
    pinRequired: false,
    // 준비가 끝나기 전에는 학생에게 열지 않는다.
    published: false,
    order,
    notionUrl: '',
    ownerUid: uid,
  }
  await setDoc(courseRef(id), course)
  return { id, ...course }
}

export async function updateCourse(
  courseId: string,
  patch: Partial<Omit<CourseMeta, 'id' | 'ownerUid'>>,
): Promise<void> {
  await updateDoc(courseRef(courseId), patch)
}

export async function reorderCourses(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db)
  orderedIds.forEach((id, index) => batch.update(courseRef(id), { order: index }))
  await batch.commit()
}

/**
 * 과목 문서만 지운다. 딸린 것은 정리하지 않는다 — 보통은 아래
 * deleteCourseWithContents 를 쓸 것.
 */
export async function deleteCourse(courseId: string): Promise<void> {
  await deleteDoc(courseRef(courseId))
}

/**
 * 과목과 그 안의 것을 전부 지운다 — 자료 파일, 수업목차, 수업 내용,
 * 그 수업들의 발표자료까지.
 *
 * **과목을 지우면서 수업 내용을 안 지우던 것이 새는 자리였다.** materials 도
 * seasons/activities 도 과목의 하위 컬렉션이 아니라 courseId 필드로만
 * 연결돼 있어서, 과목 문서를 지워도 Firestore 가 따라 지워주지 않는다. 남은
 * 문서는 어느 화면에도 안 뜨는데 저장 용량은 계속 차지한다.
 *
 * 순서가 중요하다. 과목 문서를 먼저 지우면 화면에서 그 과목을 다시 열 수 없어
 * 남은 것을 정리할 방법이 없어진다.
 */
export async function deleteCourseWithContents(courseId: string): Promise<void> {
  await deleteMaterialsOfCourse(courseId)
  await deleteLessonsOf({ courseId })
  await deleteCourse(courseId)
}
