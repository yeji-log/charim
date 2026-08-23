/**
 * 수업내용(시즌 + 활동) 데이터 계층.
 *
 *   workspaces/{wsId}/seasons/{id}      수업목차 카드 하나 (동아리에서는 "시즌")
 *   workspaces/{wsId}/activities/{id}   수업 하나 (동아리에서는 "활동")
 *
 * ── 컬렉션을 과목 밑에 중첩하지 않는다 ──
 * `courseId` 필드가 있으면 그 과목의 수업목차/내용이고, 없으면 동아리 것이다.
 * 중첩하면 동아리용 화면을 따로 복제해야 한다 — CHICODE 가 컬렉션 하나를 두
 * 맥락에서 공유하며 화면 세 개를 재사용하는 구조를 그대로 가져온 것이다
 * (lessonScope.ts 참고).
 *
 * Firestore 는 undefined 필드 값을 거부한다. `courseId` 는 없을 수 있으므로
 * 쓸 때 항상 조건부로 펼쳐야 한다 — **절대 `courseId: undefined` 로 넣지 말 것.**
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
} from 'firebase/firestore'

import { db } from './firebase'
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
 * 발표자료 자리를 표시하는 특수 항목.
 *
 * 내용은 여기 content 가 아니라 slides.ts 에 파일로 저장되지만, **"몇 번째
 * 순서에 보일지"는 다른 항목과 똑같이 배열 위치로 정한다** — 그래야 교사가
 * 발표자료 위치도 화살표로 옮길 수 있다.
 *
 * 수업 하나에 정확히 하나만 있고 교사가 지울 수 없다. 없으면 normalizeActivity
 * 가 맨 끝에 자동으로 채운다.
 */
const SLIDES_SECTION_ID = 'slides'

export function isSlidesSection(section: Section): boolean {
  return section.kind === 'slides'
}

export function makeSlidesSection(): Section {
  return { id: SLIDES_SECTION_ID, title: '발표자료', content: '', isCode: false, kind: 'slides' }
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
  /** 있으면 과목 스코프, 없으면 동아리 스코프. */
  courseId?: string
}

export type ActivityInput = Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>

export interface Season {
  id: string
  title: string
  emoji: string
  status: '진행중' | '준비중' | '완료'
  order: number
  description: string
  courseId?: string
}

export type SeasonInput = Omit<Season, 'id'>

const seasonsRef = () => collection(db, ...wsPath('seasons'))
const seasonRef = (id: string) => doc(db, ...wsPath('seasons', id))
const activitiesRef = () => collection(db, ...wsPath('activities'))
const activityRef = (id: string) => doc(db, ...wsPath('activities', id))

function normalizeActivity(id: string, data: Record<string, unknown>): Activity {
  const sections = Array.isArray(data.sections) ? (data.sections as Section[]) : []
  // 발표자료 자리가 없는 수업(이 기능 이전에 만든 것)은 맨 끝에 채워 넣는다.
  const withSlides = sections.some(isSlidesSection) ? sections : [...sections, makeSlidesSection()]

  return {
    ...(data as Omit<Activity, 'id' | 'sections'>),
    id,
    sections: withSlides,
  }
}

// ── 시즌 (과목에서는 "수업목차") ────────────────────────────────

/**
 * `courseId` 를 주면 그 과목 것만, 안 주면 동아리 것만(courseId 없는 문서만)
 * 돌려준다. 같은 컬렉션을 두 맥락이 공유하므로 이 필터가 없으면 서로 섞인다.
 *
 * 정렬은 클라이언트에서 한다 — `where` + `orderBy(다른 필드)` 는 복합 색인을
 * 요구한다.
 */
export async function listSeasons(opts?: { courseId?: string }): Promise<Season[]> {
  const snapshot = opts?.courseId
    ? await getDocs(query(seasonsRef(), where('courseId', '==', opts.courseId)))
    : await getDocs(seasonsRef())

  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }) as Season)
    .filter((season) => (opts?.courseId ? true : !season.courseId))
    .sort((a, b) => a.order - b.order)
}

export async function addSeason(input: SeasonInput): Promise<Season> {
  const id = crypto.randomUUID()
  // courseId 가 undefined 면 필드 자체를 빼야 한다. Firestore 는 undefined 를 거부한다.
  const { courseId, ...rest } = input
  await setDoc(seasonRef(id), { ...rest, ...(courseId ? { courseId } : {}) })
  return { id, ...input }
}

export async function updateSeason(id: string, patch: Partial<SeasonInput>): Promise<void> {
  await updateDoc(seasonRef(id), patch)
}

export async function deleteSeason(id: string): Promise<void> {
  await deleteDoc(seasonRef(id))
}

// ── 활동 (과목에서는 "수업 내용") ───────────────────────────────

export async function listActivities(opts?: {
  seasonId?: string
  publishedOnly?: boolean
  courseId?: string
  /**
   * 준비 중인 시즌의 활동도 포함한다. 로그인한 교사가 미리 볼 때만 켠다 —
   * 학생에게는 로드맵에 안 보이는 시즌인데 목록으로는 열리는 게 앞뒤가 맞지
   * 않는다.
   */
  includePreparingSeason?: boolean
}): Promise<Activity[]> {
  const snapshot = opts?.seasonId
    ? await getDocs(query(activitiesRef(), where('seasonId', '==', opts.seasonId)))
    : opts?.courseId
      ? await getDocs(query(activitiesRef(), where('courseId', '==', opts.courseId)))
      : await getDocs(activitiesRef())

  let activities = snapshot.docs.map((entry) => normalizeActivity(entry.id, entry.data()))

  // seasonId 도 courseId 도 없으면 컬렉션 전체를 받아온 것이라, 과목에 속한
  // 활동이 동아리 목록에 섞이지 않게 여기서 거른다.
  if (!opts?.seasonId && !opts?.courseId) {
    activities = activities.filter((activity) => !activity.courseId)
  }

  if (opts?.publishedOnly) {
    activities = activities.filter((activity) => activity.published)

    if (!(opts.seasonId && opts.includePreparingSeason)) {
      // 시즌 목록도 **같은 스코프로** 불러야 한다. 안 그러면 과목 스코프에서
      // 이 필터가 동아리 시즌만 보고 조용히 무력화된다.
      const preparing = new Set(
        (await listSeasons(opts.courseId ? { courseId: opts.courseId } : undefined))
          .filter((season) => season.status === '준비중')
          .map((season) => season.id),
      )
      activities = activities.filter((activity) => !preparing.has(activity.seasonId))
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
  const { courseId, ...rest } = input

  // **만들 때도 발표자료 자리를 채운다.** 예전엔 normalizeActivity(읽을 때)만
  // 채웠는데, 그러면 방금 만든 수업을 바로 편집창에서 열었을 때 발표자료 항목이
  // 없다 — 화면을 새로고침해야 나타나서 "발표자료를 올릴 곳이 없다"로 보인다.
  // 읽기 쪽 보정은 그대로 두되(옛 문서 대비) 여기서도 보장한다.
  const sections = rest.sections.some(isSlidesSection)
    ? rest.sections
    : [...rest.sections, makeSlidesSection()]

  const activity = {
    ...rest,
    sections,
    ...(courseId ? { courseId } : {}),
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(activityRef(id), activity)
  return { id, ...input, sections, createdAt: now, updatedAt: now }
}

export async function updateActivity(id: string, patch: Partial<ActivityInput>): Promise<void> {
  await updateDoc(activityRef(id), { ...patch, updatedAt: Date.now() })
}

export async function deleteActivity(id: string): Promise<void> {
  await deleteDoc(activityRef(id))
}

// ── 동아리 홈 설정 ──────────────────────────────────────────────

export interface ClubSettings {
  todayMissionText: string
  /** 강조해서 보여줄 활동들. 비어 있으면 그 자리를 아예 숨긴다. */
  featuredActivityIds: string[]
  /** 동아리 전체를 잠그는 핀. 과목 핀과 같은 "가벼운 잠금"이다. */
  pin: string
  pinRequired: boolean
  updatedAt: number
}

const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  todayMissionText: '',
  featuredActivityIds: [],
  pin: '',
  pinRequired: false,
  updatedAt: 0,
}

/** CHICODE 의 labSettings/home 싱글턴에 해당한다. 학교마다 하나라 wsId 아래에 둔다. */
const clubSettingsRef = () => doc(db, ...wsPath('settings', 'club'))

export async function getClubSettings(): Promise<ClubSettings> {
  const snapshot = await getDoc(clubSettingsRef())
  if (!snapshot.exists()) return DEFAULT_CLUB_SETTINGS
  return { ...DEFAULT_CLUB_SETTINGS, ...(snapshot.data() as Partial<ClubSettings>) }
}

export async function updateClubSettings(patch: Partial<ClubSettings>): Promise<void> {
  // 문서가 아직 없을 수 있으므로 merge 로 만들면서 갱신한다.
  await setDoc(clubSettingsRef(), { ...patch, updatedAt: Date.now() }, { merge: true })
}
