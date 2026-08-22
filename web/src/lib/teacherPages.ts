import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore'

import { db } from './firebase'
import { wsPath } from './workspace'

/**
 * 교사 공개 페이지 — charim.../t/{slug}
 *
 * 문서 id 가 곧 슬러그다. 이게 중복 방지 장치다.
 *
 * "이미 있는지 확인하고 없으면 저장"은 쓰지 않는다 — 두 교사가 동시에 같은
 * 슬러그를 저장하면 둘 다 확인을 통과한다. 문서 id 로 두면 이미 있는 슬러그에
 * 대한 저장이 create 가 아니라 update 로 분류되고, 규칙의
 * resource.data.uid == request.auth.uid 가 서버에서 거부한다.
 *
 * 이메일은 절대 넣지 않는다. 이 컬렉션을 members 와 따로 만드는 이유 자체가
 * members 를 공개 읽기로 열지 않기 위해서다(firestore.rules 참고).
 */
export interface TeacherPage {
  slug: string
  uid: string
  displayName: string
  published: boolean
}

/**
 * 영문 소문자·숫자·하이픈만. 2~30자, 하이픈으로 시작하거나 끝날 수 없다.
 *
 * 한글을 막는 이유는 주소창 때문이다 — /t/김선생 은 복사하면
 * /t/%EA%B9%80%EC%84%A0%EC%83%9D 으로 펼쳐져서 학생에게 불러주기 어렵다.
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])$/

export class SlugError extends Error {}

/** 입력을 다듬고 규칙에 맞는지 본다. 안 맞으면 SlugError 를 던진다. */
export function normalizeSlug(raw: string): string {
  const slug = raw.trim().toLowerCase()

  if (!slug) throw new SlugError('주소를 입력해 주세요.')
  if (slug.length < 2) throw new SlugError('두 글자 이상이어야 합니다.')
  if (slug.length > 30) throw new SlugError('30자를 넘을 수 없습니다.')
  if (!SLUG_PATTERN.test(slug)) {
    throw new SlugError(
      '영문 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다.',
    )
  }
  return slug
}

/**
 * 내 교사 페이지를 찾는다.
 *
 * members/{uid} 에 슬러그를 복사해두지 않고 여기서 질의하는 이유 — 같은 값을
 * 두 곳에 두면 언젠가 어긋난다. teacherPages 는 어차피 공개 읽기라 질의에
 * 추가 권한도 필요 없다.
 */
export async function getMyTeacherPage(uid: string): Promise<TeacherPage | null> {
  const found = await getDocs(
    query(collection(db, ...wsPath('teacherPages')), where('uid', '==', uid), limit(1)),
  )
  const first = found.docs[0]
  if (!first) return null

  const data = first.data()
  return {
    slug: first.id,
    uid: data.uid,
    displayName: data.displayName ?? '',
    published: data.published ?? false,
  }
}

/** 공개된 교사 페이지 전부. 학생용 홈에서 "선생님 고르기"에 쓴다. */
export async function listTeacherPages(): Promise<TeacherPage[]> {
  const found = await getDocs(
    query(collection(db, ...wsPath('teacherPages')), where('published', '==', true)),
  )
  return found.docs
    .map((snapshot) => ({
      slug: snapshot.id,
      uid: snapshot.data().uid,
      displayName: snapshot.data().displayName ?? '',
      published: true,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'))
}

/** 슬러그로 찾는다. `/t/{슬러그}` 가 이걸 쓴다 — 문서 id 가 슬러그라 조회 한 번이다. */
export async function getTeacherPageBySlug(slug: string): Promise<TeacherPage | null> {
  const snapshot = await getDoc(doc(db, ...wsPath('teacherPages', slug)))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  return {
    slug: snapshot.id,
    uid: data.uid,
    displayName: data.displayName ?? '',
    published: data.published ?? false,
  }
}

/**
 * 공개 여부와 무관하게 전부. 반의 담당 교사를 고를 때 쓴다.
 *
 * `published` 는 학생용 홈에 뜰지를 정하는 값이라, 꺼둔 교사도 동료가 담당으로
 * 지정할 수 있어야 한다. 자기 페이지를 아직 안 만든 교사는 여기 안 나온다 —
 * 그 경우 먼저 교사 페이지에서 주소를 정하라고 안내하면 된다.
 */
export async function listAllTeacherPages(): Promise<TeacherPage[]> {
  const found = await getDocs(collection(db, ...wsPath('teacherPages')))
  return found.docs
    .map((snapshot) => ({
      slug: snapshot.id,
      uid: snapshot.data().uid,
      displayName: snapshot.data().displayName ?? '',
      published: snapshot.data().published ?? false,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'))
}

/**
 * 저장. 슬러그를 바꾼 경우 새 문서를 먼저 만들고 옛 문서를 지운다.
 *
 * 순서가 중요하다. 옛 문서를 먼저 지웠는데 새 문서 생성이 거부되면(남이 이미
 * 쓰는 슬러그) 교사는 주소를 통째로 잃는다. 반대 순서면 최악의 경우 문서가
 * 둘 남는데, 둘 다 같은 uid 를 가리키므로 학생에게는 아무 문제가 없다.
 */
export async function saveTeacherPage(
  page: TeacherPage,
  previousSlug?: string,
): Promise<void> {
  const slug = normalizeSlug(page.slug)

  try {
    await setDoc(doc(db, ...wsPath('teacherPages', slug)), {
      uid: page.uid,
      displayName: page.displayName.trim(),
      published: page.published,
    })
  } catch (caught) {
    if ((caught as { code?: string }).code === 'permission-denied') {
      throw new SlugError('이미 다른 선생님이 쓰고 있는 주소입니다. 다른 주소를 지어 주세요.')
    }
    throw caught
  }

  if (previousSlug && previousSlug !== slug) {
    await deleteDoc(doc(db, ...wsPath('teacherPages', previousSlug)))
  }
}
