# 차림 CHARIM — 로고 SVG (수정본)

원본 `차림_CHARIM_SVG_로고_패키지.zip` 을 검증하고 고친 결과물이다.
원본 zip 은 그대로 두었다 — 이 폴더가 새 버전이다.

## 고친 것

### 1. 로고 4종의 중첩 `<svg>` 제거 (버그)

`charim-logo-horizontal / vertical / white / tagline` 네 파일이 모두
`<g transform="...">` 안에 심볼 SVG 를 **통째로 중첩**해서 넣고 있었다.

중첩된 `<svg>` 에 `width`/`height` 가 없으면 SVG 명세상 기본값이 `100%` 라,
바깥 뷰포트(예: 1000x360)를 그대로 물려받는다. 그러면 정사각형 viewBox 512 가
`preserveAspectRatio="xMidYMid meet"` 로 **가운데 정렬되면서 축소**된다.

결과: 심볼이 의도한 `.58` 이 아니라 실질 `.41` 배율로 작아지고, 오른쪽으로
약 200 단위 밀려 워드마크에 거의 붙었다. 왼쪽에는 큰 빈 공간이 남았다.

→ 안쪽 `<svg>` / `</svg>` 두 줄만 제거하고 path 들을 `<g>` 안에 직접 두었다.
   제작 지침 9절("불필요한 `<g>` 중첩 최소화")에도 이쪽이 맞다.

### 2. 세로형 심볼 가운데 정렬 (1번을 고치자 드러난 문제)

중첩을 제거하니 세로형에서 심볼이 가운데가 아니었다. 중첩 SVG 의 자동 가운데
정렬이 이 어긋남을 우연히 가리고 있었던 것이다.

심볼 path 의 실제 x 범위는 44~386(512 기준)이다. `scale(.72)` 를 적용하면 폭 246.2,
중심은 원점에서 154.8. viewBox 폭 620 의 중앙 310 에 맞추려면 translate x = 155.

→ `translate(54 25)` → `translate(155 25)`

### 3. 세로형 viewBox 높이 정리

콘텐츠 하단(CHARIM 디센더)이 y≈572 인데 viewBox 높이가 760 이라 아래에 195 단위
(전체의 26%)가 빈 공간이었다. 정사각형 자리에 넣으면 로고가 위로 쏠려 보인다.
위쪽 여백(71)과 맞춰 645 로 줄였다.

→ `viewBox="0 0 620 760"` → `viewBox="0 0 620 645"`

### 4. `favicon-16.svg` 신규 (제작 지침 14절)

기존 `favicon.svg` 는 `charim-symbol.svg` 와 **바이트 단위로 완전히 동일한 복사본**
이었다. 심볼의 가로 막대는 512 기준 28 단위 = 5.5% 라, 16px 로 줄이면 **0.87px**
가 되어 뭉개진다.

16px 전용 버전은 `viewBox="0 0 16 16"` 으로 좌표를 픽셀에 직접 맞췄다.

- 막대 두께 2.5px, 막대 사이 간격 1.05px — 16px 에서 각 줄이 분리되어 보이는 최소치
- 막대 사이 좌우 간격 1.2px — 이보다 좁으면 두 막대가 한 줄로 붙어 보인다
- **단색 `#315C8C`** — 16px 에서는 Secondary Blue(`#7C9BB5`)의 구분이 어차피 사라지고
  대비만 떨어진다. 제작 지침 8절의 "단색" 변형에 해당한다
- 3줄 + 점이라는 형태의 리듬은 원본 심볼 그대로 유지했다

적용:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-16.svg" sizes="16x16" type="image/svg+xml">
```

## 아직 안 한 것

### 워드마크가 아직 `<text>` 다 (제작 지침 7절·20절 위반)

지침이 "최종 SVG 에서는 텍스트를 Path 로 변환"이라고 두 번 못 박았는데 원본은
`<text>` 로 남아 있다. 원본 README 도 이를 인정하고 있다.

**이 프로젝트에서는 반드시 고쳐야 한다.** 외부 CDN 금지 원칙 때문에 Pretendard 를
자체 호스팅할 텐데, SVG 를 `<img>` 태그로 넣으면 외부 SVG 문서는 부모 문서의
웹폰트를 상속받지 못한다. 시스템 기본 고딕으로 떨어져 로고 모양이 바뀐다.

Pretendard 가 로컬에 없어 아직 변환하지 못했다. Pretendard 는 SIL OFL 라이선스라
자체 호스팅과 Path 변환 모두 문제없다.

### `icon-192.png` / `icon-512.png` (제작 지침 19절)

PNG 라 별도 제작이 필요하다. 앱 아이콘은 배경 `#315C8C` + 흰색 심볼 + 둥근 모서리.

### `charim-symbol-white.svg` 의 색 구분 소실

5개 path 가 전부 흰색이라 Secondary Blue 로 ㅊ/ㄹ 흐름을 구분하던 특징이 사라진다.
리버스 로고의 의도일 수 있으나, 밝은 배경 버전과 형태 인상이 달라지는 점은 알고
쓸 것. 원본 그대로 두었다.

## 파일

| 파일 | 상태 |
|---|---|
| `charim-symbol.svg` | 원본 그대로 |
| `charim-symbol-white.svg` | 원본 그대로 |
| `charim-symbol-dark.svg` | 원본 그대로 |
| `favicon.svg` | 원본 그대로 (심볼과 동일 — 32px 이상용) |
| `favicon-16.svg` | **신규** — 16px 전용 |
| `charim-logo-horizontal.svg` | 중첩 제거 |
| `charim-logo-white.svg` | 중첩 제거 |
| `charim-logo-tagline.svg` | 중첩 제거 |
| `charim-logo-vertical.svg` | 중첩 제거 + 가운데 정렬 + viewBox 높이 |

## 브랜드 색상

- Primary `#315C8C`
- Primary Dark `#244461`
- Secondary `#7C9BB5`
- Text `#263442`
- Background `#F5F7FA`
- Line `#E6EAF0`
