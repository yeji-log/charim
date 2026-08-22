/**
 * 로고를 <img> 가 아니라 인라인 SVG 로 둔다.
 *
 * 이유가 둘 있다.
 *
 * 1. brand/logo/ 의 가로형 로고는 워드마크("차림 / CHARIM")가 아직 <text> 요소다.
 *    외부 SVG 를 <img> 로 넣으면 그 문서는 부모 페이지의 @font-face 를 상속받지
 *    못해서, Pretendard 를 자체 호스팅해도 로고 안 글자만 시스템 고딕으로
 *    떨어진다. 그래서 심볼(순수 path)만 SVG 로 쓰고 글자는 HTML 텍스트로 그린다 —
 *    Path 변환 작업이 끝나기 전까지의 우회가 아니라, 이쪽이 더 낫다:
 *    글자가 선택·검색되고 다크/화이트 변형도 CSS 로 처리된다.
 *
 * 2. 원본 심볼의 viewBox 는 0 0 512 512 인데 실제 그림은 x 44~386, y 64~410 에만
 *    있다. 그대로 쓰면 헤더에서 왼쪽 위로 쏠려 보인다. 콘텐츠 범위에 여백 14를
 *    더한 viewBox 로 잘라 가운데를 맞췄다.
 */
export function CharimSymbol({
  className = '',
  title,
  mono = false,
}: {
  className?: string
  title?: string
  /** 어두운 배경 위 흰색 반전처럼 한 색으로만 그려야 할 때. */
  mono?: boolean
}) {
  return (
    <svg
      viewBox="30 50 370 374"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path fill="currentColor" d="M118 92a28 28 0 1 0 56 0 28 28 0 1 0-56 0Z" />
      <path
        fill="currentColor"
        d="M72 150h278c15.5 0 28 12.5 28 28s-12.5 28-28 28H72c-15.5 0-28-12.5-28-28s12.5-28 28-28Z"
      />
      <path
        fill="currentColor"
        d="M72 252h116c15.5 0 28 12.5 28 28s-12.5 28-28 28H72c-15.5 0-28-12.5-28-28s12.5-28 28-28Z"
      />
      {/* ㄹ의 흐름을 나타내는 획만 Secondary Blue. 흰색 반전 버전에서는 이
          구분이 사라진다(brand/logo/README.md) — mono 가 그 경우다. */}
      <path
        className={mono ? undefined : 'text-secondary'}
        fill="currentColor"
        d="M164 252h114c15.5 0 28 12.5 28 28s-12.5 28-28 28h-86c-16 0-29.5 13-29.5 29s13 29 29 29H358c15.5 0 28 12.5 28 28s-12.5 28-28 28H191c-47 0-85-38-85-85 0-42.5 34.5-77 77-77Z"
      />
      <path
        fill="currentColor"
        d="M72 354h116c15.5 0 28 12.5 28 28s-12.5 28-28 28H72c-15.5 0-28-12.5-28-28s12.5-28 28-28Z"
      />
    </svg>
  )
}

/** 헤더용 가로 조합 — 심볼 + 워드마크(HTML 텍스트). */
export default function Logo() {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <CharimSymbol className="size-8 text-primary" title="차림" />
      <span className="text-[1.35rem] font-bold leading-none tracking-tight text-primary-dark">
        차림
      </span>
    </span>
  )
}
