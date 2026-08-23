/**
 * 발표 모드의 실시간 상태.
 *
 * 차림에서 처음 등장하는 실시간 동기화다. 교사가 슬라이드를 넘기면 같은 수업
 * 화면을 보는 학생 기기가 따라온다.
 *
 * ── 수업 하나당 상태가 전역으로 하나뿐이다 ──
 * 학생은 로그인이 없으므로 "어느 반, 어느 교실"을 구분할 방법이 없다. 그래서
 * 같은 수업으로 두 교실이 동시에 발표하면 서로의 화면에 영향을 준다.
 * CHICODE 에서 사용자가 알고 받아들인 트레이드오프이고 차림도 같다.
 *
 * 진짜 반 구분을 하려면 세션 코드 같은 걸 학생이 입력해야 하는데, 그건
 * "학생은 아무것도 입력하지 않는다"는 지금 구조와 충돌한다. 필요해지면 그때
 * 다시 판단할 일이지 지금 몰래 끼워 넣을 것이 아니다.
 *
 * currentSlide 는 1부터 시작하고 PDF 쪽 번호와 그대로 맞아떨어진다.
 */
import {
  arrayUnion,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'

import { db } from './firebase'
import { wsPath } from './workspace'

export interface InkPoint {
  x: number
  y: number
}

/**
 * 펜을 누르고 뗄 때까지의 궤적 하나.
 *
 * 좌표는 캔버스 픽셀이 아니라 **슬라이드 기준 0~1 비율**이다. 교사 화면과
 * 학생 화면의 실제 렌더 크기가 서로 다르므로(각자 자기 화면에 맞춰 그린다),
 * 비율로 저장해야 어느 기기에서든 같은 자리에 그려진다.
 *
 * 굵기는 고정값이라 담지 않는다. color 가 없으면 렌더링 쪽에서 기본색으로
 * 대체한다.
 */
export interface InkStroke {
  points: InkPoint[]
  color?: string
}

/** strokes 가 없을 때 매번 새 배열을 만들지 않기 위한 공유 빈 배열. */
export const EMPTY_INK_STROKES: InkStroke[] = []

export interface PresentationState {
  active: boolean
  currentSlide: number
  updatedAt: number
  /** 슬라이드 번호(1부터) → 그 쪽에 그린 펜 획들. Firestore 맵이라 키는
   *  실제로는 문자열이지만, 대괄호 접근이 숫자를 문자열로 바꿔주므로
   *  호출부는 숫자로 그냥 읽고 쓴다. 아무도 안 그렸으면 필드가 없다. */
  ink?: Record<number, InkStroke[]>
}

const IDLE: PresentationState = { active: false, currentSlide: 1, updatedAt: 0 }

const presentationRef = (activityId: string) => doc(db, ...wsPath('presentations', activityId))

/** 학생·교사 화면 모두 이걸로 구독한다. */
export function subscribePresentation(
  activityId: string,
  onChange: (state: PresentationState) => void,
): Unsubscribe {
  return onSnapshot(presentationRef(activityId), (snapshot) => {
    onChange(snapshot.exists() ? (snapshot.data() as PresentationState) : IDLE)
  })
}

/**
 * 발표를 시작한다. 시작 쪽은 부르는 쪽이 정한다 — 교사가 지금 훑어보던 쪽을
 * 그대로 넘기면 "보던 자리에서 시작"이 된다.
 *
 * 종료할 때 currentSlide 를 건드리지 않으므로, 교사가 쪽을 옮기지 않으면
 * 자연히 "종료한 자리에서 재개"가 된다.
 */
export async function startPresentation(activityId: string, atSlide: number): Promise<void> {
  await setDoc(presentationRef(activityId), {
    active: true,
    currentSlide: atSlide,
    updatedAt: Date.now(),
  } satisfies PresentationState)
}

/**
 * 발표를 끝낸다.
 *
 * 파워포인트 펜처럼 그동안 그린 자국은 여기서 전부 버린다 — "잉크를
 * 유지할까요?" 같은 선택지는 두지 않는다.
 *
 * deleteField() 를 쓰는 이유: merge:true 는 중첩 맵을 깊이 병합하므로 빈
 * 객체로 덮어써도 옛 획이 남는다. 필드 자체를 지워야 한다.
 */
export async function stopPresentation(activityId: string): Promise<void> {
  await setDoc(
    presentationRef(activityId),
    { active: false, updatedAt: Date.now(), ink: deleteField() },
    { merge: true },
  )
}

/**
 * 방금 그은 획 하나를 그 슬라이드에 더한다.
 *
 * 포인터가 움직일 때마다가 아니라 **펜을 뗀 시점에 한 번만** 부른다. 매
 * 프레임 쓰면 무료 쓰기 한도가 순식간에 녹는다.
 */
export async function addInkStroke(
  activityId: string,
  slide: number,
  stroke: InkStroke,
): Promise<void> {
  await updateDoc(presentationRef(activityId), {
    [`ink.${slide}`]: arrayUnion(stroke),
  })
}

/** 슬라이드를 넘길 때는 그대로 두고, "전체 지우기"를 눌렀을 때만 지운다. */
export async function clearInkForSlide(activityId: string, slide: number): Promise<void> {
  await updateDoc(presentationRef(activityId), {
    [`ink.${slide}`]: deleteField(),
  })
}

/**
 * 지우개로 일부만 지운 뒤 남은 획으로 그 슬라이드를 통째로 덮어쓴다.
 *
 * addInkStroke(arrayUnion)와 달리 배열 전체를 준다 — 지우개는 "무엇을
 * 지울지"가 아니라 "무엇이 남는지"를 클라이언트가 이미 계산해서 알고 있다.
 */
export async function setInkForSlide(
  activityId: string,
  slide: number,
  strokes: InkStroke[],
): Promise<void> {
  await updateDoc(presentationRef(activityId), {
    [`ink.${slide}`]: strokes,
  })
}

export async function setCurrentSlide(activityId: string, slide: number): Promise<void> {
  await setDoc(
    presentationRef(activityId),
    { currentSlide: slide, updatedAt: Date.now() },
    { merge: true },
  )
}
