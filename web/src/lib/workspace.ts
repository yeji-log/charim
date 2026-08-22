/**
 * 학교 하나 = workspace 하나. 당분간 이 상수 하나로 고정한다.
 *
 * 지금은 학교가 하나뿐이라 문서 경로를 평평하게 둬도 동작은 같다. 그런데도
 * 처음부터 workspaces/{wsId} 밑에 중첩해두는 이유는, 나중에 다른 학교를 받게
 * 될 때 firestore.rules 와 라우팅만 열면 되기 때문이다. 데이터를 옮기는 것보다
 * 훨씬 싸다.
 *
 * 이 상수를 하드코딩된 경로 문자열로 흩뿌리지 말고, 아래 헬퍼를 거쳐서만 쓴다.
 */
export const WS_ID = 'default'

/** workspaces/{wsId}/... 아래의 경로 조각을 만든다. */
export function wsPath(...segments: string[]) {
  return ['workspaces', WS_ID, ...segments]
}
