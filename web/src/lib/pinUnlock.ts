/**
 * 핀 게이트를 통과한 사실을 기억해두는 곳.
 *
 * **왜 필요한가** — 통과 여부를 화면 state 로만 들고 있으면 새로고침 한 번에
 * 다시 묻는다. 학생이 자료 PDF 를 열었다가 뒤로 오거나, 태블릿에서 앱을
 * 전환했다가 돌아와 페이지가 다시 뜨는 것만으로도 핀을 또 쳐야 했다.
 * 수업 중에 이게 반복되면 교사가 핀번호를 몇 번씩 다시 불러줘야 한다.
 *
 * **왜 sessionStorage 인가** — localStorage 는 탭을 닫아도 남는다. 학교
 * 공용 컴퓨터에서 다음 시간 다른 반 학생이 그대로 들어가면 안 되므로,
 * 탭/브라우저를 닫으면 사라지는 sessionStorage 를 쓴다. CHICODE 의
 * `subjects.ts` / `labs.ts` 가 같은 이유로 같은 선택을 했다.
 *
 * **핀 값도 함께 저장한다** — 교사가 핀을 바꾸면 이전 핀으로 통과한 세션은
 * 다시 묻게 된다. 저장된 값과 지금 과목의 핀이 다르면 통과로 치지 않는다.
 * 핀 자체는 어차피 Firestore 에서 공개로 읽히는 값이라(courses.ts 의 "가벼운
 * 잠금" 설명 참고) 이걸 저장한다고 새로 새는 것은 없다.
 */

const KEY_PREFIX = 'charim:pin-unlocked:'

/** 게이트마다 키를 나눈다 — 과목 하나를 통과했다고 다른 과목까지 열리면 안 된다. */
export function isPinUnlocked(gateKey: string, pin: string): boolean {
  try {
    return sessionStorage.getItem(KEY_PREFIX + gateKey) === pin
  } catch {
    // 시크릿 모드 등에서 저장소를 막아도 화면은 그대로 돌아야 한다 — 매번
    // 핀을 묻는, 이 변경 이전의 동작으로 떨어질 뿐이다.
    return false
  }
}

export function markPinUnlocked(gateKey: string, pin: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + gateKey, pin)
  } catch {
    // 위와 같다.
  }
}
