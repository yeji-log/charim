# 차림 CHARIM — Claude 세션 인계 문서

> **오늘의 수업을 차리다.**

이 파일은 Claude Code가 이 폴더를 열 때 계정과 무관하게 자동으로 읽는다.
다른 계정/세션에서 이어서 작업할 때는 이 문서 하나로 맥락을 따라잡을 수 있어야 한다.
**작업 방식(맨 아래 "작업 스타일" 절)까지 반드시 지켜서 이어가야 이전 세션과
톤이 어긋나지 않는다.**

작성 시점: 2026-08-22. 코드는 아직 한 줄도 없다 — 이 문서는 "무엇을 왜 이렇게
만들기로 했는지"의 기록이고, 다음 세션이 여기서부터 시작하면 된다.

---

## 0. 지금까지 온 곳 / 다음 할 일

**1~7단계 완료**(골격 / 로그인·멤버 / 시간표 / 반 명단·수업기록 / 과목·수업자료·핀 게이트 / 수업내용 보드·동아리 / 발표 모드). 앱은 `web/` 아래에 있다.

```
web/src/index.css          Pretendard @font-face + @theme 색 토큰
web/src/App.tsx            헤더 탭 + 풋터 레이아웃
web/src/main.tsx           라우팅
web/src/components/Logo.tsx  심볼 인라인 SVG + HTML 워드마크
web/src/auth/AuthProvider.tsx  Google 로그인 + members/{uid} 확인
web/src/lib/firebase.ts    Auth + Firestore (Storage 는 안 쓴다)
web/src/lib/workspace.ts   WS_ID 상수 + wsPath() 헬퍼
web/src/lib/teacherPages.ts  내 수업 주소(슬러그) 저장·조회
web/src/lib/timetable.ts   시간표 — timetables/{uid}
web/src/lib/classRecords.ts  반 명단(공용) + 참여 기록(교사별)
web/src/lib/chunkedFile.ts   파일을 base64 조각으로 Firestore 에 저장 ★
web/src/lib/courses.ts       과목 (핀·공개 여부)
web/src/lib/materials.ts     수업자료 — 파일은 chunkedFile 에 맡긴다
web/src/lib/pinThrottle.ts   핀 오입력 감속
web/src/pages/CourseGate.tsx 핀 게이트 (부모 라우트가 <Outlet/> 을 연다)
web/src/pages/TeacherPublicPage.tsx  /t/{슬러그}
web/src/lib/lessons.ts       시즌 + 활동 (courseId 유무로 과목/동아리)
web/src/lib/lessonScope.ts   화면 하나를 두 맥락에 마운트하는 스코프 훅 ★
web/src/pages/BoardEditor.tsx  교사용 보드 (시즌·활동·항목 편집)
web/src/pages/TeacherCourseEdit.tsx  과목 편집 — /teacher/course/{id}
web/src/lib/slides.ts        발표자료(PPT/PDF) + 대본
web/src/lib/presentation.ts  발표 실시간 상태 (onSnapshot)
web/src/lib/mapUpsertPolyfill.ts  ★ 지우면 갤럭시탭 발표 화면이 빈 화면이 된다
web/src/components/PdfViewer.tsx     pdf.js 직접 렌더
web/src/components/SlideViewer.tsx   pptx 시도 → 실패 시 PDF
web/src/components/TeacherPresenter.tsx  교사 발표 제어 + 대본
web/src/pages/ClassRecords.tsx  수업기록 화면
web/src/pages/Schedule.tsx 일정 (시간표 + 기록 탭)
web/src/pages/Teacher.tsx  로그인 / 미등록(uid 표시) / 대시보드
web/src/pages/*.tsx        Home 과 Teacher 외에는 자리표시
web/public/fonts/          woff2 서브셋 4종 + OFL 원문
firestore.rules            권한 규칙 (루트 — 앱 코드가 아니다)
```

**다음은 8단계(홈)** — 명세 7절 순서 그대로. 다른 화면이 다 있어야 홈에 뭘
모을지 정해진다. 로그인 상태로 갈라 교사용(오늘의 수업·미작성 기록·오늘의
시간표)과 학생용(오늘의 수업·자료 보기) 두 벌을 그린다. 그다음이 9단계
정책 문서다.

**아직 안 만든 것** — 항목 첨부파일과 유튜브 링크(CHICODE 에는 있다). 발표
모드를 넣으면서 함께 가져오려다 범위가 커져 미뤘다. 필요해지면 그때.

정렬은 `@dnd-kit` 없이 화살표 버튼으로 통일했다(사용자 결정).

Firebase 쪽은 이미 살아 있다 — 프로젝트 `charim-b2c13`, 규칙 배포됨(CLI),
소유자 멤버 문서 등록됨, 교사 페이지 슬러그와 시간표 저장까지 실제로 확인했다.

### 읽을 것

1. **이 문서를 끝까지.** 특히 3절(이미 결정된 것)과 11절(작업 스타일).
2. **[`핵심기능_명세.md`](핵심기능_명세.md).** 이식할 기능들의 데이터 모델·화면
   구조·주의점이 CHICODE 실제 코드 기준으로 정리돼 있다.
   **데이터 모델은 그 문서가 이 문서 4절보다 우선한다.**

### Firestore 규칙 배포

규칙은 저장소 루트에 있다 — `firestore.rules` / `firebase.json`. 앱 코드가 아니라
인프라 설정이라 `web/` 밖에 둔다. 배포 도구(`firebase-tools`)도 같은 이유로
루트 `package.json` 의 devDependency 다.

**web/package.json 에 넣지 말 것.** Vercel 의 Root Directory 가 `web` 이라
거기 있는 devDependency 는 배포할 때마다 전부 설치된다. firebase-tools 는
620개 패키지를 끌고 와서(web 자체는 90개다) 빌드가 매번 그만큼 느려진다.

```
"C:/Program Files/nodejs/npm.cmd" run deploy:rules
```

**CLI 로그인 완료 (2026-08-23).** 토큰은
`C:/Users/user/.config/configstore/firebase-tools.json` 에 있고 `.firebaserc` 가
프로젝트를 고정하므로 위 명령 한 줄이면 배포된다.

로그인이 풀리면 다시 해야 하는데, 이 환경은 터미널이 없어서 `firebase login` 이
"URL 방문 → 코드 받아 `firebase login <코드>`" 방식으로 자동 전환된다. URL 을
출력한 뒤 프로세스가 libuv 어서션으로 죽지만, 그 전에 세션(codeVerifier)을
configstore 에 저장하므로 이어서 진행하면 된다. 승인은 사용자가 직접 해야 한다.

### 배포 (Vercel)

**저장소 루트에는 `package.json` 이 없다.** 앱이 `web/` 아래에 있기 때문이다.
Vercel 프로젝트 설정의 **Root Directory 를 `web` 으로 지정해야** 빌드가 돈다.
지정하지 않으면 Vercel 이 루트를 정적 사이트로 보고 `index.html` 을 못 찾아
`404: NOT_FOUND` 만 뜬다 (charim.vercel.app 이 실제로 그 상태였다).

Root Directory 를 `web` 으로 두면 Vercel 이 Vite 를 자동 인식해서
`npm install` → `npm run build` → `dist` 배포까지 알아서 한다.

`web/vercel.json` 의 rewrite 는 SPA 딥링크용이다 — 이게 없으면 `/schedule` 로
직접 들어왔을 때 Vercel 이 그 경로의 파일을 찾다가 404 를 낸다. react-router 가
받으려면 모든 경로를 `index.html` 로 돌려줘야 한다.

환경 변수 6개(`VITE_FIREBASE_*`)를 Vercel 프로젝트 설정에도 넣어야 한다 —
`web/.env.local` 은 저장소에 올라가지 않는다. 값은 `web/.env.example` 의 항목
이름 그대로이고, 실제 값은 Firebase 콘솔 또는 로컬 `.env.local` 에 있다.

Authentication 승인 도메인에 `charim.vercel.app` 을 등록해야 로그인이 된다.

**환경변수에 API 키를 넣을 때 가려진 값을 복사하지 말 것.** 실제로 겪었다 —
Vercel 에 들어간 `VITE_FIREBASE_API_KEY` 값이 `AIzaSyBu` + 가운뎃점(U+2022) 31개
였다. 화면에 가려져 표시된 상태 그대로 복사된 것인데, 길이(39자)도 앞 8글자도
진짜와 같아서 눈으로는 구분되지 않는다. 공백도 따옴표도 없어 흔한 붙여넣기
검사에도 안 걸린다. Vercel 의 Sensitive 옵션을 켜면 값을 다시 볼 수 없어 이
사고를 더 잘 만든다 — 어차피 번들에 실려 나가는 공개 값이니 켜지 말 것.

값이 의심되면 눈으로 보지 말고 해시로 대조한다. 배포된 번들에서 `apiKey`
리터럴을 꺼내 브라우저에서 SHA-256 을 구하고 로컬 `.env.local` 값의 해시와
비교하면 확정된다. 화면 오류 문구(`AuthProvider.tsx` 의 `explainAuthError`)에도
이 원인을 적어뒀다.

**검증 완료 (2026-08-23)**: PC·아이패드 양쪽에서 배포본 로그인 성공.
아이패드가 됐다는 건 `firebase.ts` 의 `browserLocalPersistence` 우회가 실기기에서
실제로 통했다는 뜻이다 — 그 코드를 지우지 말아야 할 근거가 하나 더 생겼다.

### 실행

이 PC 는 Node 가 PATH 에 없다(10절). `npm run dev` 는 그래서 죽는다 —
`.claude/launch.json` 이 `node.exe` 로 vite 를 직접 실행하도록 돼 있으니
그쪽을 쓴다. 직접 돌릴 때는:

```
"C:/Program Files/nodejs/npm.cmd" --prefix web run build
```

### 아직 물어봐야 할 것

- **참여 기록을 담당 교사끼리 공유할지** (명세 4.5절) — 4단계 전에.
- **워드마크 Path 변환 도구 설치** (10절) — 외부 다운로드라 확인 필요.

원격 저장소: `https://github.com/yeji-log/charim.git`

---

## 1. 무엇을 만드는가

**한국 고등학교 교사가 매일 수업을 준비하고 운영하는 웹서비스.**
과목을 가리지 않는다(국어·영어·수학·과학·예체능 전부).

### 기능

| 기능 | 설명 | 누가 보나 |
|---|---|---|
| 홈 | "오늘 몇 교시, 어느 반, 뭘 준비하지"를 한 화면에 | 교사 / 학생(별도 화면) |
| 수업자료 | 과목별 파일 업로드·열람. 학생은 핀번호 입력 | 교사 쓰기 / 학생 읽기 |
| 수업목차·수업내용 | 차시별 수업 내용을 카드·보드로 정리 | 교사 쓰기 / 학생 읽기 |
| 시간표 | 요일 x 교시 그리드. **교사마다 각자 다름** | 교사 본인 |
| 수업기록 | 반별 학생 명단 + 날짜별 참여 기록 | 교사만 |
| 교사 로그인 | Google 로그인 + 멤버 확인 | 교사 |
| 교사 공개 페이지 | `/t/{슬러그}` — 그 교사 과목만 모아 보여준다 | 학생 |

### 사용자

- **주 사용자: 교사.** 하루에도 여러 번 여는 **업무 도구**다.
- **부 사용자: 학생.** 로그인 없이 수업자료·수업내용 화면만 본다.
- 규모: **같은 학교 동료 교사 몇 명** + 학생 수백 명. **초대제**(공개 가입 아님).

---

## 2. CHICODE와의 관계

같은 사람이 만든 별개 서비스다. `C:\Users\user\Desktop\chicode` 에 있다.

**CHICODE는 그대로 둔다.** 차림은 완전히 새 저장소·새 Firebase 프로젝트다.
코드는 가져오되(아래 7절), **브랜드는 완전히 분리한다**(6절).

CHICODE의 `CLAUDE.md`와 `web/README.md`는 읽을 가치가 있다 — 특히 Firestore
조각 저장(`materials.ts`), 아이패드 Safari 로그인 이슈, 무료 플랜 제약의 "왜"가
거기 적혀 있다. 차림에도 그대로 적용되는 내용이 많다.

---

## 3. 이미 결정된 것 (다시 논의하지 말 것)

사용자가 직접 고른 것들이다. 다음 세션이 몰래 뒤집지 말 것.

1. **사용 범위: 같은 학교 동료 교사 몇 명, 초대제.**
   불특정 다수 대상 SaaS가 아니다. 셀프 가입·요금제·약관 체계는 만들지 않는다.
2. **수업기록(학생 학번·이름)은 서버에 저장한다.**
   브라우저 로컬 저장이나 별칭 방식이 아니라 CHICODE와 같은 Firestore 저장이다.
   같은 학교 교사끼리는 어차피 같은 학생을 담당하므로 이 선택을 했다.
   → 개인정보처리방침은 "담당 교사"가 아니라 **"해당 학교 교사"** 기준으로 써야 한다.
3. **기술 스택: Vite + React + TypeScript + Firebase + Vercel.**
   CHICODE와 같게 간다. 그래야 코드 이식이 공짜다.
4. **브랜드명: 차림 / CHARIM.** 슬로건 "오늘의 수업을 차리다."
5. **교사마다 공개 주소를 하나씩 준다 — `/t/{슬러그}`** (2026-08-22 결정).
   교사가 로그인해서 자기 슬러그를 직접 정하고, 그 아래에 자기 과목만 뜬다.
   교사는 수업 첫날 학생에게 주소 한 줄만 알려주면 된다. 학교 전체 과목이
   한 목록에 섞이면 학생이 자기 선생님 걸 못 찾는다는 게 이 결정의 이유다.
   상세는 `핵심기능_명세.md` 4.6절.
6. **Firebase 프로젝트: `charim-b2c13`** (2026-08-22 생성 완료).
   CHICODE와 같은 Google 계정이고 프로젝트만 새로 팠다.
   계정을 새로 파지 않는다 — 무료(Spark) 한도가 계정이 아니라 **프로젝트 단위**로
   적용되므로 새 프로젝트를 만들면 저장 1GiB·읽기 5만/일을 CHICODE와 나눠 쓰지
   않는다. 격리도 프로젝트 단위라(Firestore·Auth 사용자 풀·규칙·승인 도메인이
   전부 별개) 소유 계정이 같다고 데이터가 섞이지 않는다.
   계정을 나누면 Vercel·GitHub까지 갈라져 관리만 번거로워진다.

   웹 앱 설정값은 `web/.env.local` 에 넣어뒀다(`web/.env.example` 이 항목 이름만
   담은 사본이다). 이 값들은 비밀이 아니다 — 클라이언트 번들에 그대로 실려
   배포되고, 실제 차단은 `firestore.rules` 가 한다.

   아직 안 한 것:
   - **Cloud Storage는 켜지 않는다** — 새 프로젝트에서는 Blaze 유료 플랜을 요구한다
   - Authentication 승인 도메인에 배포 주소를 등록해야 로그인이 된다
     (CHICODE는 GitHub Pages 주소를 등록 안 해서 그쪽은 로그인이 안 되는 상태다)
   - 동료 교사 한 명을 Firebase 프로젝트 멤버(Editor)로 추가해 둘 것 —
     학교가 함께 쓰는 도구라 관리자가 한 명뿐이면 위험하다

---

## 4. 핵심 설계 — 데이터를 세 층으로 나눈다

CHICODE는 교사 1명 전용이라 이 구분이 없었다. **차림의 설계는 사실상 이게 전부다.**

| 층 | 누구 것 | 예 |
|---|---|---|
| **학교 공용** | 모든 멤버가 공유 | 반 명단, 사이트 설정 |
| **과목별** | 담당 교사가 관리, 학생이 열람 | 수업자료, 수업목차/내용, 핀 |
| **교사 개인** | 본인만 | 시간표 |

```
workspaces/{wsId}                    ← 학교 하나 (당분간 1개만 존재)
  members/{uid}                      ← 교사 + 역할
  settings/site                      ← 학교 이름·색·쓸 기능 토글
  settings/club                      ← 동아리 홈 설정 + 핀
  teacherPages/{slug}                ← 교사 공개 주소 /t/{slug} ★
  courses/{courseId}                 ← 과목 (담당 교사, 핀)
  materials/{id}                     ← 자료 (courseId 필드로 과목에 연결)
  seasons/{id}                       ← 시즌/수업목차 (courseId 없으면 동아리)
  activities/{id}                    ← 활동/수업내용 (courseId 없으면 동아리)
  classes/{classId}/students/{id}    ← 반 명단 (담당 교사끼리 공유)
                   /dates/{id}       ← 날짜별 참여 기록
  timetables/{uid}                   ← 시간표는 교사마다 다르다 ★
```

**필드 단위 상세와 이식 절차는 [`핵심기능_명세.md`](핵심기능_명세.md)에 있다.**
`seasons`/`activities`를 과목 밑에 중첩하지 않고 평평하게 두는 이유도 거기 적었다
(요약: CHICODE가 컬렉션 하나를 과목·동아리 두 맥락에서 공유하는 구조라, 중첩하면
화면을 복제해야 한다).

### ★ 여기가 CHICODE와 갈리는 지점

CHICODE는 `timetable/default`, `labSettings/home`, `practiceSettings/pico2w` 처럼
**문서 하나만 쓰는 싱글턴**이 여럿이다. 교사가 1명이라 문제가 없었다.
교사가 여럿이면 그 문서 하나를 서로 덮어쓴다.

- `timetable/default` → `timetables/{uid}` (교사마다)
- `labSettings/home` → `settings/site` (학교마다)

**새로 만들 때 최상위 전역 컬렉션과 고정 id 싱글턴을 만들지 말 것.**

### workspace는 1개로 시작하되 경로는 처음부터 중첩한다

`wsId`를 상수 하나로 고정해두면 코드 복잡도는 지금과 같으면서, 나중에 다른
학교를 받을 때 규칙과 라우팅만 열면 된다. 싼 보험이다.

### 반 명단을 공유하는 게 이 설계의 실질적 이득

CHICODE는 교사가 자기 반 명단을 직접 입력했다. 학교 단위면 한 명이 만들어두면
다른 교사가 그대로 쓴다.

다만 공유 범위는 **담당 교사끼리**다(5절). 한 반에 국어·수학·영어 교사가 함께
들어가면 그 셋이 명단 하나를 나눠 쓰고, 그 반에 안 들어가는 교사에게는 아예
보이지 않는다.

---

## 5. 권한 규칙 (firestore.rules)

**프론트엔드 검사는 장식이고, 진짜 방어선은 `firestore.rules`다.** CHICODE에서
그대로 가져오는 원칙이다.

- CHICODE의 `isTeacher()`(= `teachers/{email}` 문서 존재 여부, Firebase 콘솔에서
  수동 추가) → **`isMember(wsId)`** (= `workspaces/{wsId}/members/{uid}` 존재 여부)로 바꾼다.
- 학생은 로그인이 없으므로 `courses` / `materials` / `units` 는 `read: true`.
  **핀번호는 "가벼운 잠금"이다** — 읽기를 열어둬야 학생 화면이 뜨므로 핀 값도
  함께 공개된다. CHICODE에서 사용자가 알고 받아들인 트레이드오프이고, 차림도
  같다. 진짜 서버 검증은 Blaze 유료 플랜 + Cloud Functions가 필요하다.
  **이 트레이드오프를 다음 세션이 몰래 "강화"하려고 하지 말 것.**
- `classes` / `students` / `records` / `timetables` 는 `read`도 `isMember()`로 막는다.
  학생 학번·이름은 미성년자 개인정보다.

### 반 명단 열람 범위 — 결정됨 (2026-08-22)

**담당 교사는 담당 반만 본다.** `isMember()`만으로는 열지 않는다. 같은 학교라도
남의 학년 학생 명단까지 다 보이는 건 과하다는 판단이다.

`classes` 문서에 담당 교사를 적고, 읽기·쓰기 모두 그 목록에 있어야 통과시킨다.
한 반에 여러 과목 교사가 들어가므로 담당자는 **단수 소유자가 아니라 목록**이다.
Firestore 규칙은 목록 조회를 자동으로 걸러주지 않으므로, 클라이언트 질의에
`where('teacherUids', 'array-contains', uid)` 를 넣고 규칙이 그 조건을 강제해야
한다. 상세는 `핵심기능_명세.md` 4.5절·5절.

---

## 6. 브랜드

전체 가이드는 `brand/브랜딩_가이드.md`, 로고 규격은 `brand/로고_제작_지침.md`.
**CHICODE 스타일(치즈 캐릭터, 노랑/크림, 둥근 손글씨체)을 절대 가져오지 않는다.**

### 색

| 이름 | 값 | 용도 |
|---|---|---|
| Primary | `#315C8C` | 로고, 주요 버튼, 활성 메뉴, 링크 |
| Primary Dark | `#244461` | 사이드바, 헤더, 어두운 배경 |
| Secondary | `#7C9BB5` | 보조 요소, 비활성, 설명 텍스트 |
| Background | `#F5F7FA` | 페이지 배경 |
| Surface | `#FFFFFF` | 카드 |
| Text | `#263442` | 본문·제목 |
| Success / Warning / Error | `#4E8068` / `#D59A35` / `#C65B5B` | 상태 |
| Line | `#E6EAF0` | 구분선 |

밝은 회색을 넓게, 블루를 포인트로. 노랑·크림은 메인 색으로 쓰지 않는다.

### 폰트

**Pretendard 1.3.9** — `brand/pretendard/` 에 이미 받아뒀다(SIL OFL, 자체 호스팅 가능).

```
brand/pretendard/otf/          Bold, SemiBold — SVG Path 변환용
brand/pretendard/woff2/        Regular/Medium/SemiBold/Bold subset — 웹 적용용
brand/pretendard/LICENSE.txt   OFL 원문 (배포 시 동봉 필요)
brand/pretendard/pretendard-subset.css   @font-face 참고용
```

**외부 CDN을 쓰지 않는다.** 학교 네트워크가 CDN을 막을 수 있다는 전제 —
CHICODE에서 Pyodide·Monaco·clang을 전부 자체 호스팅한 것과 같은 이유다.
woff2-subset은 4종 합쳐 1.05MB로 가볍다.

### 로고

`brand/logo/` 에 있다. 상세 이력은 `brand/logo/README.md` 참고.

원본 zip에 **중첩 `<svg>` 버그**가 있어서 고쳤다 — `<g transform>` 안에 심볼 SVG를
통째로 넣었는데, 중첩 `<svg>`에 width/height가 없으면 명세상 기본값이 `100%`라
바깥 뷰포트를 물려받는다. 그 결과 심볼이 `.58`이 아니라 실질 `.41` 배율로 작아지고
오른쪽으로 200단위 밀려 워드마크에 붙었다. 로고 4종 전부 그랬다.
세로형은 가운데 정렬과 viewBox 높이도 함께 고쳤다.

`favicon-16.svg`는 16px 전용으로 새로 만들었다 — 원본 `favicon.svg`는 심볼 파일의
바이트 단위 복사본이라 가로 막대가 16px에서 0.87px로 뭉갠다.

### 심볼을 어떻게 설명할 것인가

제작 지침은 `ㅊ` + `ㄹ` 추상화라고 하는데, 실제로는 **"정돈된 목록"** 으로 먼저
읽힌다(가로 막대 3줄 + 점). 그게 오히려 브랜드 키워드(정돈·준비)와 잘 맞으므로,
대외 설명은 "정돈된 목록" 쪽으로 가는 것을 권한다. 로고는 설명 없이 읽혀야 한다.

### 두 청중, 하나의 디자인 시스템

이게 이 제품 디자인의 핵심 과제다. **완전히 다른 디자인을 두 벌 만들지 않는다.**
색·폰트·아이콘·버튼·카드는 공유하고 **밀도만 다르게** 간다.

- 교사 화면: 정보 밀도 높게. 카드 기반, 좌측/상단 네비, 시간표와 오늘의 수업 우선
- 학생 화면: 여백 넉넉하게. 큰 제목, 간단한 상단 네비, 관리 정보 제거

### 브랜드 언어

"관리"라는 단어를 피하고 **준비·확인·기록**을 쓴다.

- 쓴다 — `수업 준비`, `수업 기록`, `자료 확인`, `오늘의 수업`, `시간표 보기`
- 안 쓴다 — `학생 관리`, `수업 관리`, `자료 관리`

---

## 7. CHICODE에서 가져올 것

경로는 전부 `C:\Users\user\Desktop\chicode\web\` 기준이다.

| 자산 | 파일 | 손볼 곳 |
|---|---|---|
| 활동 보드 | `src/lib/labs.ts`, `src/pages/LabBoardEditor.tsx`, `LabActivityDetail.tsx` | **가장 값나가는 자산.** 섹션 드래그·코드블록·체크리스트·첨부. 이름을 "수업 내용"으로 |
| 시간표 | `src/lib/timetable.ts`, `TimetableBoard` | 문서 id를 `default` → `{uid}` |
| 수업기록 | `src/lib/classRecords.ts` | 반 명단을 학교 공용으로 분리 |
| 발표 모드 | `src/lib/labSlides.ts`, `src/components/PptxSlideViewer.tsx`, `PdfViewer.tsx` | 반 구분 불가 트레이드오프는 그대로 |
| 로그인 | `src/lib/firebase.ts` | **아이패드 Safari persistence 우회가 이미 들어 있다** — 지우지 말 것 |
| 핀 게이트 | `src/lib/pinThrottle.ts`, `src/pages/LabGate.tsx` | 학생 무로그인 전제 동일 |
| 파일 저장 | `src/lib/chunkedFile.ts`, `src/lib/materials.ts` | 무료 플랜 유지 시 그대로 |
| 스코프 훅 | `src/lib/labScope.ts` | 같은 화면을 스코프만 바꿔 재마운트하는 패턴. workspace를 한 겹 더 얹을 때 참고 |

### 안 가져올 것

- `src/c/**` 전부 (clang.wasm, 직접 구현한 WASI)
- Pyodide 워커, `scripts/sync-*.mjs` (clang·monaco·pyodide 동기화)
- 뉴스 파이프라인 (GitHub Actions 자동 수집) — 필요해지면 그때
- 치즈 브랜딩 일체

---

## 8. 비용과 개인정보

### 비용 — 무료 한도 안에 들어간다

교사 5명 + 학생 수백 명 규모면 Firestore 무료(Spark) 한도 안이다.
CHICODE의 `chunkedFile.ts`(파일을 base64 조각으로 Firestore에 저장) 방식을 그대로
써서 **"서버 비용 0원" 원칙을 유지할 수 있다.**

다만 **저장 1GiB 한도는 PPT를 base64로 쌓으면 한두 해에 찰 수 있다**
(base64는 원본보다 약 37% 커진다). 그때 Blaze + Cloud Storage로 옮기면 되도록
**데이터 계층(`lib/*.ts`)을 얇게 유지할 것** — 화면은 lib 함수만 호출하게 한다.
CHICODE `materials.ts` 주석에 같은 이야기가 적혀 있다.

### 개인정보 — 방침을 다시 써야 한다

CHICODE의 `src/content/PrivacyPolicy.tsx`는 **"담당 교사가 자기 학생을 관리한다"**
전제로 쓰여 있다. 차림은 같은 학교 교사들이 학생 정보를 **공유**하므로 최소한
이만큼은 고쳐야 한다.

- 열람 권한 범위를 명시 (누가 어느 학생 정보를 볼 수 있는지 — 5절의 열린 결정과 연결)
- 보유 기간·삭제 절차
- 만 14세 미만 관련 조항은 고등학교 대상이므로 CHICODE와 동일하게 유지 가능

**콘텐츠(정책 문서)는 실제 코드 동작을 근거로 작성하고, 적용 전에 텍스트 초안부터
사용자에게 보여준다.** CHICODE에서 그렇게 했다.

---

## 9. 만드는 순서

앞 단계가 끝날 때마다 실제로 눌러보고 확인받은 뒤 다음으로 간다.

1. ~~**프로젝트 골격**~~ — 완료
2. **로그인 + 멤버** — `firebase.ts` 이식, `isMember()` 규칙, workspace 상수 고정
3. **시간표(교사별)** — 개인정보가 없어서 가장 먼저 실물이 나온다
4. ~~**반 명단 + 수업기록**~~ — 완료. 명단은 담당 교사 공용, 기록은 교사별
5. ~~**과목 + 수업자료 + 핀 게이트**~~ — 완료. `/t/{슬러그}` 도 함께
6. ~~**수업내용 보드**~~ — 완료. 동아리도 같은 화면을 스코프만 바꿔 쓴다
7. ~~**발표 모드**~~ — 완료. PPT+PDF, 대본 자동 추출, 실시간 동기화
8. **정책 문서** — 실제 동작을 확인한 뒤 작성

1~3번까지만 해도 쓸 만한 게 나온다.

---

## 10. 지금 남아 있는 일

### 워드마크 Path 변환 (아직 안 됨)

로고 SVG의 `차림` / `CHARIM`이 아직 `<text>` 요소다. 제작 지침 7절·20절이
"Path로 변환"이라고 두 번 못 박았는데 원본이 안 지켰다.

**반드시 고쳐야 한다.** 외부 SVG를 `<img>` 태그로 넣으면 부모 문서의 웹폰트를
상속받지 못해서, Pretendard를 자체 호스팅해도 로고 안 글자는 시스템 고딕으로
떨어진다.

- 폰트는 `brand/pretendard/otf/` 에 준비돼 있다
- **정정: Node 는 이 환경에 있다.** `C:/Program Files/nodejs/node.exe` 에 v24.19.0,
  npm 11.17.0 이 깔려 있는데 PATH 에 등록만 안 돼 있어서 없는 것처럼 보였다
  (`node -v` 가 "command not found"). 그래서 변환 도구 선택지는 둘이다 —
  npm 의 `opentype.js`, 또는 `pip install fonttools`. 어느 쪽이든 외부 다운로드라
  **설치 전에 사용자에게 물을 것.**

  PATH 문제는 실행에도 영향이 있다. `npm run dev` 는 내부에서 `node` 를 PATH 에서
  다시 찾기 때문에 그대로는 죽는다. `.claude/launch.json` 은 그래서 npm 을 거치지
  않고 `node.exe` 로 vite 진입 스크립트를 직접 실행한다.

### 앱 아이콘 PNG

`icon-192.png` / `icon-512.png` — 배경 `#315C8C` + 흰색 심볼 + 둥근 모서리.
텍스트 `차림`은 넣지 않는다(제작 지침 9절·13절).

### ~~`Pretendard-1.3.9.zip` (47MB)~~ — 처리됨

`.gitignore` 2번 줄 `Pretendard-*.zip` 이 이미 걸러낸다(`git check-ignore` 로 확인).
파일 자체는 루트에 그대로 두었다.

### 상표·중복 확인

차림은 일반명사라 상표 확보가 어려울 수 있다. 학교 내부용이면 무관하지만
나중에 넓힐 생각이면 동명 서비스 여부를 한 번 확인해둘 것.

---

## 11. 작업 스타일 (중요 — 이 톤을 유지할 것)

CHICODE에서 그대로 이어받는다.

- **먼저 검증, 그다음 구현.** "될 것 같다"가 아니라 실제로 설치해서 돌려보고
  확인한다. 라이브러리 채택/기각도 실측(용량, 실제 실행 결과)으로 판단한다 —
  감으로 판단하지 않는다.
  *이 문서의 로고 SVG 버그도 파일을 직접 열어보고 좌표를 계산해서 찾은 것이다.*
- **UI가 걸린 변경은 커밋 전에 로컬에서 보여주고 확인받는다.**
  Push는 사용자가 명시적으로 "커밋해줘"/"push해줘"라고 말할 때만 한다.
  묶어서 진행하지 않는다 — 승인 단위를 존중할 것.
- **콘텐츠(정책 문서 등)는 실제 코드 동작을 근거로 작성**하고, 적용 전 텍스트
  초안부터 보여준다.
- **외부 다운로드는 먼저 확인받는다.** 파일명·출처·용량을 밝히고 묻는다.
- 커밋 메시지에 "왜 이렇게 했는지"(특히 버그를 찾은 과정, 버린 대안)를 자세히
  적는다 — 이 문서와 같은 톤으로 유지할 것.
