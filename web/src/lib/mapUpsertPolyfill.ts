/**
 * Map.prototype.getOrInsert / getOrInsertComputed 폴리필.
 *
 * **이 파일을 지우면 갤럭시 탭에서 발표 화면이 통째로 빈 화면이 된다.**
 *
 * CHICODE 가 실기기 로그로 찾아낸 원인이다. pdf.js 가 내부에서
 * Map.prototype.getOrInsertComputed 를 여러 곳에서 쓰는데, 이건 TC39 "Upsert"
 * 제안이 2026년 1월에야 표준이 된 아주 최근 기능이라 그보다 오래된 브라우저에는
 * 없다. pdf.js 는 있다고 가정하고 그냥 호출해서, 렌더링 도중(try/catch 밖의
 * 비동기 경로)에서 TypeError 가 나고 잡히지 않은 채 캔버스만 비워진 채 남는다 —
 * 오류 문구조차 안 뜬다.
 *
 * pdf.js 버전을 낮추면 그 뒤에 고쳐진 다른 버그들이 되돌아오므로, 표준 스펙
 * 그대로 폴리필 하나만 앱 시작 시 채워 넣는다. 이미 네이티브로 지원하는
 * 브라우저에서는 typeof 검사에 걸려 아무 일도 하지 않는다.
 *
 * pdf.js 가 동적으로 로드되기 전에 미리 채워야 한다 — main.tsx 최상단에서 부른다.
 *
 * 스펙: https://github.com/tc39/proposal-upsert
 */
export function installMapUpsertPolyfill(): void {
  const proto = Map.prototype as Map<unknown, unknown> & {
    getOrInsert?: (key: unknown, value: unknown) => unknown
    getOrInsertComputed?: (key: unknown, callbackfn: (key: unknown) => unknown) => unknown
  }

  if (typeof proto.getOrInsert !== 'function') {
    proto.getOrInsert = function (this: Map<unknown, unknown>, key, value) {
      if (!this.has(key)) this.set(key, value)
      return this.get(key)
    }
  }

  if (typeof proto.getOrInsertComputed !== 'function') {
    proto.getOrInsertComputed = function (this: Map<unknown, unknown>, key, callbackfn) {
      if (!this.has(key)) this.set(key, callbackfn(key))
      return this.get(key)
    }
  }
}
