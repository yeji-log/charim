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
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore'

import { db } from './firebase'
import { wsPath } from './workspace'

export interface PresentationState {
  active: boolean
  currentSlide: number
  updatedAt: number
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

export async function stopPresentation(activityId: string): Promise<void> {
  await setDoc(presentationRef(activityId), { active: false, updatedAt: Date.now() }, { merge: true })
}

export async function setCurrentSlide(activityId: string, slide: number): Promise<void> {
  await setDoc(
    presentationRef(activityId),
    { currentSlide: slide, updatedAt: Date.now() },
    { merge: true },
  )
}
