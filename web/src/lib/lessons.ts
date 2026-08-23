/**
 * 수업내용(시즌 + 활동) 데이터 계층.
 *
 *   workspaces/{wsId}/seasons/{id}      수업목차 카드 하나 (동아리에서는 "시즌")
 *   workspaces/{wsId}/activities/{id}   수업 하나 (동아리에서는 "활동")
 *
 * ── 컬렉션을 과목·동아리 밑에 중첩하지 않는다 ──
 * `courseId` 가 있으면 그 과목의 수업목차/내용, `clubId` 가 있으면 그 동아리의
 * 시즌/활동이다(둘이 함께 들어가는 일은 없다). 중첩하면 동아리용 화면을 따로
 * 복제해야 한다 — CHICODE 가 컬렉션 하나를 두 맥락에서 공유하며 화면 세 개를
 * 재사용하는 구조를 그대로 가져온 것이다(lessonScope.ts 참고).
 *
 * **예전에는 "courseId 가 없으면 동아리"였다.** 동아리가 학교에 하나뿐일 때
 * 통하던 규칙인데, 교사마다 동아리를 갖게 되면서(2026-08-23) 무엇에도 속하지
 * 않는 문서가 생겨 못 쓰게 됐다. 그 시절 자료를 옮기는 함수가 이 파일 맨
 * 아래에 있다(listLegacyLessons / adoptLegacyLessons).
 *
 * Firestore 는 undefined 필드 값을 거부한다. 두 필드 다 없을 수 있으므로 쓸 때
 * 항상 조건부로 펼쳐야 한다 — **절대 `courseId: undefined` 로 넣지 말 것.**
 *
 * ── 고정 카테고리를 두지 않는다 ──
 * CHICODE 는 처음에 Arduino/Pico/IoT/AI/Project 다섯 개를 enum 으로 박았다가
 * 뺐다. 교사가 그 다섯 칸 밖의 수업을 못 넣기 때문이다. **시즌 자체가 곧
 * 분류다.** 교사가 새 시즌을 만들면 그게 새 분류가 된다.
 *
 * 항목(sections)이 배열인 이유도 같다. 예전엔 goal/learn/prep/code/... 가 고정
 * 필드였는데, 교사가 이름을 바꾸고 추가하고 순서를 옮겨야 해서 배열로 바꿨다.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { db } from './firebase'
import { deletePresentation } from './presentation'
import { deleteSlideSet } from './slides'
import { wsPath } from './workspace'

/**
 * 활동 본문을 이루는 항목 하나(예: "오늘의 목표", "준비물").
 *
 * `isCode` 를 켜면 고정폭 글꼴 + 복사 버튼이 붙은 블록으로, 아니면 일반
 * 문단(줄바꿈 유지)으로 그려진다.
 *
 * `kind: 'checklist'` 는 체크박스 목록이다. **체크 상태는 교사가 미리 정해두는
 * 안내판이고 학생은 못 바꾼다** — 학생마다 다른 상태를 저장할 로그인도
 * 저장소도 없기 때문이다. 이 제약을 모르고 "학생이 체크할 수 있게" 바꾸려
 * 들면 학생 로그인부터 만들어야 한다.
 */
export interface Section {
  id: string
  title: string
  content: string
  isCode: boolean
  kind?: 'checklist' | 'slides'
  /** kind === 'checklist' 일 때만 쓴다. */
  items?: ChecklistItem[]
}

/**
 * 수업자료(수업 시간에 화면에 띄울 PPT·PDF) 자리를 표시하는 특수 항목.
 *
 * 이름이 과목의 "자료" 탭(학생이 내려받는 파일)과 비슷해서 헷갈리기 쉽다.
 * 교사가 쓰는 말이 "수업자료"라 화면에서는 이 이름을 쓰되, 코드에서는
 * slides 로 부른다 — 파일 성격이 다르고 저장 위치도 다르다(slides.ts).
 *
 * 내용은 여기 content 가 아니라 slides.ts 에 파일로 저장되지만, **"몇 번째
 * 순서에 보일지"는 다른 항목과 똑같이 배열 위치로 정한다** — 그래야 교사가
 * 수업자료 위치도 화살표로 옮길 수 있다.
 *
 * 수업 하나에 정확히 하나만 있고 교사가 지울 수 없다. 없으면 normalizeActivity
 * 가 맨 끝에 자동으로 채운다.
 */
const SLIDES_SECTION_ID = 'slides'

export function isSlidesSection(section: Section): boolean {
  return section.kind === 'slides'
}

export function makeSlidesSection(): Section {
  return { id: SLIDES_SECTION_ID, title: '수업자료', content: '', isCode: false, kind: 'slides' }
}

export interface ChecklistItem {
  id: string
  text: string
  checked: boolean
}

export function makeSection(title = ''): Section {
  return { id: crypto.randomUUID(), title, content: '', isCode: false }
}

export function makeChecklistSection(): Section {
  return {
    id: crypto.randomUUID(),
    title: '체크리스트',
    content: '',
    isCode: false,
    kind: 'checklist',
    items: [],
  }
}

export interface Activity {
  id: string
  title: string
  /** 속한 시즌. 비어 있으면 아직 어느 시즌에도 안 속하고 목록에만 보인다. */
  seasonId: string
  order: number
  /** false 면 준비 중 — 교사에게만 보인다. */
  published: boolean
  sections: Section[]
  /** 외부 자료 링크(노션 등). 파일 자체는 수업자료 쪽에 올린다. */
  materialUrl: string
  createdAt: number
  updatedAt: number
  updatedBy: string
  /** 과목 스코프면 그 과목 id. clubId 와 동시에 들어가지 않는다. */
  courseId?: string
  /** 동아리 스코프면 그 동아리 id(= 담당 교사 uid). */
  clubId?: string
}

export type ActivityInput = Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>

export interface Season {
  id: string
  title: string
  emoji: string
  status: '진행중' | '준비중' | '완료'
  order: number
  description: string
  /** 과목 스코프면 그 과목 id. clubId 와 동시에 들어가지 않는다. */
  courseId?: string
  /** 동아리 스코프면 그 동아리 id(= 담당 교사 uid). */
  clubId?: string
}

export type SeasonInput = Omit<Season, 'id'>

/**
 * 시즌·활동이 어디에 속하는지.
 *
 * 예전에는 "courseId 가 없으면 동아리"였다. 동아리가 학교에 하나뿐일 때는
 * 통했지만, 교사마다 동아리를 갖게 되면서 "없음"으로는 어느 동아리인지 알 수
 * 없어졌다. 그래서 두 갈래를 **둘 다 명시**하는 타입으로 바꿨다.
 *
 * 유니온으로 둔 건 호출부가 스코프를 빼먹지 못하게 하려는 것이다. 옛 시그니처
 * (`opts?: { courseId?: string }`)는 인자를 안 넘기면 조용히 "동아리 전체"가
 * 됐는데, 그 기본값이 과목 화면에 동아리 자료를 섞어 넣는 사고를 만들기 쉬웠다.
 */
export type LessonOwner = { courseId: string; clubId?: never } | { clubId: string; courseId?: never }

/** LessonOwner 를 Firestore 질의용 (필드, 값) 한 쌍으로 편다. */
function ownerField(owner: LessonOwner): ['courseId' | 'clubId', string] {
  return owner.courseId ? ['courseId', owner.courseId] : ['clubId', owner.clubId as string]
}

const seasonsRef = () => collection(db, ...wsPath('seasons'))
const seasonRef = (id: string) => doc(db, ...wsPath('seasons', id))
const activitiesRef = () => collection(db, ...wsPath('activities'))
const activityRef = (id: string) => doc(db, ...wsPath('activities', id))

function normalizeActivity(id: string, data: Record<string, unknown>): Activity {
  const sections = Array.isArray(data.sections) ? (data.sections as Section[]) : []
  // 수업자료 자리가 없는 수업(이 기능 이전에 만든 것)은 맨 끝에 채워 넣는다.
  const withSlides = sections.some(isSlidesSection) ? sections : [...sections, makeSlidesSection()]

  return {
    ...(data as Omit<Activity, 'id' | 'sections'>),
    id,
    sections: withSlides,
  }
}

// ── 시즌 (과목에서는 "수업목차") ────────────────────────────────

/**
 * 한 과목 또는 한 동아리의 시즌만.
 *
 * 같은 컬렉션을 여러 맥락이 공유하므로 이 필터가 없으면 서로 섞인다.
 * 정렬은 클라이언트에서 한다 — `where` + `orderBy(다른 필드)` 는 복합 색인을
 * 요구한다.
 */
export async function listSeasons(owner: LessonOwner): Promise<Season[]> {
  const [field, value] = ownerField(owner)
  const snapshot = await getDocs(query(seasonsRef(), where(field, '==', value)))
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }) as Season)
    .sort((a, b) => a.order - b.order)
}

export async function addSeason(input: SeasonInput): Promise<Season> {
  const id = crypto.randomUUID()
  // courseId / clubId 가 undefined 면 필드 자체를 빼야 한다.
  // Firestore 는 undefined 값을 거부한다.
  const { courseId, clubId, ...rest } = input
  await setDoc(seasonRef(id), {
    ...rest,
    ...(courseId ? { courseId } : {}),
    ...(clubId ? { clubId } : {}),
  })
  return { id, ...input }
}

export async function updateSeason(id: string, patch: Partial<SeasonInput>): Promise<void> {
  await updateDoc(seasonRef(id), patch)
}

export async function deleteSeason(id: string): Promise<void> {
  await deleteDoc(seasonRef(id))
}

export async function getSeason(id: string): Promise<Season | null> {
  const snapshot = await getDoc(seasonRef(id))
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Season) : null
}

// ── 활동 (과목에서는 "수업 내용") ───────────────────────────────

export async function listActivities(opts: {
  owner: LessonOwner
  seasonId?: string
  publishedOnly?: boolean
}): Promise<Activity[]> {
  const [field, value] = ownerField(opts.owner)

  // 시즌을 집어 볼 때는 seasonId 로 질의한다 — where 두 개를 걸면 복합 색인을
  // 요구하므로 스코프는 아래에서 손으로 거른다. 시즌 id 는 UUID 라 다른
  // 스코프의 시즌과 겹칠 일이 없지만, 그래도 확인은 한다(활동이 다른 과목의
  // 시즌 id 를 들고 있는 상태로 옮겨졌을 수 있다).
  const snapshot = opts.seasonId
    ? await getDocs(query(activitiesRef(), where('seasonId', '==', opts.seasonId)))
    : await getDocs(query(activitiesRef(), where(field, '==', value)))

  let activities = snapshot.docs
    .map((entry) => normalizeActivity(entry.id, entry.data()))
    .filter((activity) => activity[field] === value)

  if (opts?.publishedOnly) {
    // 시즌 하나만 딱 집어 보는 중이고 그 시즌 자체가 준비중이면, 개별
    // published 값과 상관없이 전부 돌려준다. 시즌이 통째로 준비중이라고 이미
    // 알려준 마당에(Roadmap.tsx 카드) 그 안의 활동을 또 하나씩 숨기면 앞뒤가
    // 안 맞는다 — 화면은 이걸 "잠긴 미리보기" 목록으로 그린다
    // (ActivityList.tsx, ActivityDetail.tsx).
    const viewingSeason = opts.seasonId ? await getSeason(opts.seasonId) : null

    if (viewingSeason?.status !== '준비중') {
      activities = activities.filter((activity) => activity.published)

      if (!opts.seasonId) {
        // 시즌 필터가 없는 전체 목록(예: "전체" 탭)에서는 준비중 시즌의
        // 활동을 통째로 뺀다. 시즌 목록도 **같은 스코프로** 불러야 한다 —
        // 안 그러면 이 필터가 남의 시즌만 보고 조용히 무력화된다.
        const preparing = new Set(
          (await listSeasons(opts.owner))
            .filter((season) => season.status === '준비중')
            .map((season) => season.id),
        )
        activities = activities.filter((activity) => !preparing.has(activity.seasonId))
      }
    }
  }

  return activities.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export async function getActivity(id: string): Promise<Activity | null> {
  const snapshot = await getDoc(activityRef(id))
  return snapshot.exists() ? normalizeActivity(snapshot.id, snapshot.data()) : null
}

export async function addActivity(input: ActivityInput): Promise<Activity> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const { courseId, clubId, ...rest } = input

  // **만들 때도 수업자료 자리를 채운다.** 예전엔 normalizeActivity(읽을 때)만
  // 채웠는데, 그러면 방금 만든 수업을 바로 편집창에서 열었을 때 수업자료 항목이
  // 없다 — 화면을 새로고침해야 나타나서 "수업 자료를 올릴 곳이 없다"로 보인다.
  // 읽기 쪽 보정은 그대로 두되(옛 문서 대비) 여기서도 보장한다.
  const sections = rest.sections.some(isSlidesSection)
    ? rest.sections
    : [...rest.sections, makeSlidesSection()]

  const activity = {
    ...rest,
    sections,
    ...(courseId ? { courseId } : {}),
    ...(clubId ? { clubId } : {}),
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(activityRef(id), activity)
  return { id, ...input, sections, createdAt: now, updatedAt: now }
}

export async function updateActivity(id: string, patch: Partial<ActivityInput>): Promise<void> {
  await updateDoc(activityRef(id), { ...patch, updatedAt: Date.now() })
}

/**
 * 수업 하나를 지운다 — **딸린 것까지 전부.**
 *
 * 예전에는 activities 문서만 지웠다. 그러면 발표자료(slides/{id} 아래 PPT·PDF
 * 원본과 조각)와 발표 상태가 그대로 남는다. 발표자료는 한 개가 최대 25MB 라
 * 무료 1GiB 한도가 조용히 깎이는데, 화면 어디에도 안 뜨니 남은 줄도 모른다.
 */
export async function deleteActivity(id: string): Promise<void> {
  // 딸린 것부터 지운다. 활동 문서를 먼저 지우면 실패했을 때 그 id 를 다시
  // 찾을 방법이 없어 파일이 영영 남는다.
  await deleteSlideSet(id)
  await deletePresentation(id)
  await deleteDoc(activityRef(id))
}

// ── 옛 동아리 자료 이사 ─────────────────────────────────────────

/**
 * 스코프가 없는 시즌·활동. **동아리가 학교에 하나뿐이던 시절의 자료다.**
 *
 * 그때는 "courseId 가 없으면 동아리 것"이었다. 교사마다 동아리를 갖게 되면서
 * 그 규칙이 사라졌고, 이 문서들은 어느 동아리에도 속하지 않은 채 남았다 —
 * 어느 화면에도 안 뜨지만 지워지지도 않는다.
 *
 * 자동으로 아무 동아리에 밀어 넣지 않는다. 그러면 먼저 화면을 연 교사가
 * 남의 자료까지 가져가게 된다. 교사 페이지에서 **직접 눌러** 가져오게 한다.
 */
export async function listLegacyLessons(): Promise<{ seasons: Season[]; activities: Activity[] }> {
  const [seasonSnapshot, activitySnapshot] = await Promise.all([
    getDocs(seasonsRef()),
    getDocs(activitiesRef()),
  ])

  const orphan = (data: { courseId?: string; clubId?: string }) => !data.courseId && !data.clubId

  return {
    seasons: seasonSnapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }) as Season)
      .filter(orphan),
    activities: activitySnapshot.docs
      .map((entry) => normalizeActivity(entry.id, entry.data()))
      .filter(orphan),
  }
}

/** 위에서 찾은 옛 자료를 내 동아리로 가져온다. 한 번에 커밋해 절반만 옮겨진
 *  상태가 남지 않게 한다. */
export async function adoptLegacyLessons(clubId: string): Promise<number> {
  const { seasons, activities } = await listLegacyLessons()
  if (seasons.length === 0 && activities.length === 0) return 0

  const batch = writeBatch(db)
  seasons.forEach((season) => batch.update(seasonRef(season.id), { clubId }))
  activities.forEach((activity) => batch.update(activityRef(activity.id), { clubId }))
  await batch.commit()

  return seasons.length + activities.length
}

/**
 * 한 과목 또는 한 동아리의 시즌·활동을 전부 치운다.
 *
 * courseId / clubId 필드로만 연결돼 있어 Firestore 가 따라 지워주지 않는다.
 * 과목이나 동아리를 지우기 전에 반드시 먼저 부른다.
 *
 * 활동은 batch 로 몰아 지우지 않고 하나씩 deleteActivity 를 부른다 — 그래야
 * 발표자료와 발표 상태까지 함께 지워진다. 느리지만 지우다 만 파일을 남기는
 * 것보다 낫고, 애초에 자주 하는 일이 아니다.
 */
export async function deleteLessonsOf(owner: LessonOwner): Promise<void> {
  const [seasons, activities] = await Promise.all([listSeasons(owner), listActivities({ owner })])

  for (const activity of activities) {
    await deleteActivity(activity.id)
  }
  if (seasons.length > 0) {
    const batch = writeBatch(db)
    seasons.forEach((season) => batch.delete(seasonRef(season.id)))
    await batch.commit()
  }
}
