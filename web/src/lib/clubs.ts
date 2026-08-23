/**
 * 동아리 데이터 계층.
 *
 * **문서 id 가 곧 담당 교사의 uid 다.** 이게 "교사 한 명당 동아리 하나"를
 * 지키는 장치다(사용자 결정, 2026-08-23). 규칙에서 `clubId == request.auth.uid`
 * 한 줄이면 남의 동아리를 만들 수도, 자기 동아리를 둘로 만들 수도 없다.
 * teacherPages 가 슬러그를 문서 id 로 삼아 중복을 막는 것과 같은 수법이다.
 *
 * 원래는 `settings/club` 문서 하나였다 — 학교에 동아리 하나, 등록된 교사면
 * 누구나 고칠 수 있는 공용 공간이었다. 교사마다 자기 동아리를 갖게 되면서
 * 컬렉션으로 바꿨다. CLAUDE.md 4절이 경고하는 "고정 id 싱글턴"이 실제로 문제가
 * 된 첫 사례다.
 *
 * ownerUid 는 문서 id 와 같은 값이라 중복이다. 그래도 두는 이유는 과목
 * (CourseMeta)과 모양을 맞추기 위해서다 — 게이트·목록 같은 화면이 둘을 같은
 * 방식으로 다룰 수 있다. 저장할 때 이 둘이 어긋나지 않게 항상 문서 id 에서
 * 채운다.
 *
 * 핀은 과목과 같은 "가벼운 잠금"이다. 학생 화면이 뜨려면 읽기를 열어야 하고,
 * 그러면 핀 값도 함께 공개된다 — courses.ts 의 같은 설명을 볼 것.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

import { db } from './firebase'
import { deleteLessonsOf } from './lessons'
import { wsPath } from './workspace'

export interface ClubMeta {
  /** 문서 id = 담당 교사 uid. */
  id: string
  name: string
  pin: string
  /** false 면 핀 없이 바로 열람. */
  pinRequired: boolean
  /** false 면 준비 중. 학생 목록에 이름은 보이지만 들어갈 수 없다. */
  published: boolean
  /** 문서 id 와 같다. 과목과 모양을 맞추려고 필드로도 둔다. */
  ownerUid: string
  /** 동아리 홈의 "오늘의 미션". 비면 그 자리를 아예 숨긴다. */
  todayMissionText: string
  /** 동아리 홈에 강조해 띄울 활동들. */
  featuredActivityIds: string[]
}

const clubsRef = () => collection(db, ...wsPath('clubs'))
const clubRef = (clubId: string) => doc(db, ...wsPath('clubs', clubId))

function normalize(id: string, data: Record<string, unknown>): ClubMeta {
  return {
    id,
    name: (data.name as string) ?? '',
    pin: (data.pin as string) ?? '',
    pinRequired: data.pinRequired !== false,
    published: data.published !== false,
    // 콘솔에서 손으로 만든 문서라 ownerUid 가 없거나 어긋날 수 있다. 문서 id 가
    // 언제나 진실이므로 그쪽을 믿는다.
    ownerUid: id,
    todayMissionText: (data.todayMissionText as string) ?? '',
    featuredActivityIds: Array.isArray(data.featuredActivityIds)
      ? (data.featuredActivityIds as string[])
      : [],
  }
}

/** 학교의 모든 동아리. 학생 목록 화면이 쓴다. 정렬은 이름순. */
export async function listClubs(): Promise<ClubMeta[]> {
  const snapshot = await getDocs(clubsRef())
  return snapshot.docs
    .map((entry) => normalize(entry.id, entry.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/**
 * 내 동아리. 없으면 null — 아직 안 만든 것이다.
 *
 * 질의가 아니라 문서 하나 읽기로 끝난다. 문서 id 가 uid 라서 가능한 일이고,
 * 교사 페이지를 열 때마다 도는 호출이라 이 차이가 그대로 무료 한도로 간다.
 */
export async function getMyClub(uid: string): Promise<ClubMeta | null> {
  const snapshot = await getDoc(clubRef(uid))
  return snapshot.exists() ? normalize(snapshot.id, snapshot.data()) : null
}

export async function getClub(clubId: string): Promise<ClubMeta | null> {
  const snapshot = await getDoc(clubRef(clubId))
  return snapshot.exists() ? normalize(snapshot.id, snapshot.data()) : null
}

/**
 * 내 동아리를 만든다. 이미 있으면 그대로 돌려주고 덮어쓰지 않는다 —
 * 버튼을 두 번 눌러 이름과 핀이 날아가면 안 된다.
 */
export async function createMyClub(uid: string, name: string): Promise<ClubMeta> {
  const existing = await getMyClub(uid)
  if (existing) return existing

  const club: Omit<ClubMeta, 'id'> = {
    name: name.trim() || '동아리',
    pin: '',
    // 핀을 아직 안 정했는데 요구를 켜두면 아무도 못 들어간다(과목과 같다).
    pinRequired: false,
    // 준비가 끝나기 전에는 학생에게 열지 않는다.
    published: false,
    ownerUid: uid,
    todayMissionText: '',
    featuredActivityIds: [],
  }
  await setDoc(clubRef(uid), club)
  return { id: uid, ...club }
}

export async function updateClub(
  clubId: string,
  patch: Partial<Omit<ClubMeta, 'id' | 'ownerUid'>>,
): Promise<void> {
  await updateDoc(clubRef(clubId), patch)
}

/**
 * 동아리 문서만 지운다. 그 동아리의 시즌·활동은 호출부에서 먼저 정리해야
 * 한다 — 하위 컬렉션이 아니라 clubId 필드로 연결되어 있어서 Firestore 가
 * 따라 지워주지 않는다(courses 의 deleteCourseWithMaterials 와 같은 사정).
 * 보통은 아래 deleteClubWithContents 를 쓸 것.
 */
export async function deleteClub(clubId: string): Promise<void> {
  await deleteDoc(clubRef(clubId))
}

/**
 * 동아리와 그 안의 시즌·활동·발표자료까지 전부 지운다.
 *
 * courses.ts 의 deleteCourseWithContents 와 같은 이유다 — seasons/activities 가
 * clubId 필드로만 연결돼 있어 동아리 문서를 지워도 Firestore 가 따라 지우지
 * 않는다. 활동마다 발표자료까지 정리하는 건 deleteLessonsOf 안 deleteActivity 가
 * 한다.
 */
export async function deleteClubWithContents(clubId: string): Promise<void> {
  await deleteLessonsOf({ clubId })
  await deleteClub(clubId)
}
