/**
 * 교사 시간표(요일 x 교시) 데이터 계층.
 *
 * 문서 하나를 통째로 읽고 다시 쓰는 패턴이다 — 칸이 최대 5(요일) x 10(교시)라
 * 컬렉션으로 쪼갤 이유가 없다.
 *
 * **CHICODE 와 갈리는 지점이 여기다.** CHICODE 는 `timetable/default` 라는 고정
 * id 싱글턴을 썼다. 교사가 한 명이라 문제가 없었지만, 여럿이면 그 문서 하나를
 * 서로 덮어쓴다. 차림은 `workspaces/{wsId}/timetables/{uid}` 로 교사마다 문서를
 * 가른다 — 그래서 이 파일의 함수는 전부 uid 를 받는다. 모듈 전역에 "현재 uid"를
 * 숨겨두지 않은 것은 의도적이다. 누구의 시간표를 건드리는지 호출부에서 늘
 * 보이는 편이 안전하다.
 *
 * 학생에게 보여줄 이유가 없는 교사 업무 정보(반 이름, 교실)라 firestore.rules
 * 에서 읽기도 isMember() 로 막는다. 과목·자료의 핀처럼 "가벼운 잠금"이 아니라
 * 진짜로 로그인한 교사만 볼 수 있다.
 */
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

import { db } from './firebase'
import { wsPath } from './workspace'

export const TIMETABLE_DAYS = ['월', '화', '수', '목', '금'] as const

export const DEFAULT_PERIODS = 7
const MIN_PERIODS = 1
const MAX_PERIODS = 10

export interface TimetableCell {
  subject: string
  className: string
  room: string
  note: string
}

export interface TimetableData {
  periods: number
  /** 키는 `${dayIndex}-${period}` (dayIndex: 0=월 … 4=금, period 는 1부터). */
  cells: Record<string, TimetableCell>
  /** 반 이름(trim) -> 지정 색(hex). 여기 없는 반은 autoClassColor() 로 이름에서
   *  결정론적으로 뽑은 색을 쓴다. */
  classColors: Record<string, string>
  /** 교시(1부터) -> 시간 표시용 자유 텍스트. 형식을 강제하지 않는다 —
   *  "09:00" 이든 "09:00~09:50" 이든 교사가 쓰는 대로 둔다. */
  periodTimes: Record<number, string>
}

const EMPTY_CELL: TimetableCell = { subject: '', className: '', room: '', note: '' }

function timetableRef(uid: string) {
  return doc(db, ...wsPath('timetables', uid))
}

/**
 * 같은 반 이름은 항상 같은 색으로 보이게 하는 기본값.
 *
 * 무작위로 배정하면 새로고침마다 색이 바뀌어서 오히려 헷갈린다. 이름을 해시해
 * 매번 같은 색이 나오게 했다. classColors 에 직접 지정하면 그쪽이 우선한다.
 *
 * 팔레트는 차림 배경(#F5F7FA)과 본문색(#263442) 위에서 글자가 읽히도록 전부
 * 밝은 톤으로 골랐다. 브랜드 블루 계열만으로는 반끼리 구분이 안 되므로 색상은
 * 흩되, 채도를 낮춰 화면이 알록달록해지지 않게 했다.
 */
const AUTO_PALETTE = [
  '#DCE6F2',
  '#DCEFE4',
  '#F3E3DC',
  '#E6E0F0',
  '#FBE8D3',
  '#D9EDF2',
  '#F6DDDD',
  '#E8EFD5',
  '#F0E1EC',
  '#DDEAE8',
] as const

export { AUTO_PALETTE }

export function autoClassColor(className: string): string {
  const trimmed = className.trim()
  let hash = 0
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0
  }
  return AUTO_PALETTE[Math.abs(hash) % AUTO_PALETTE.length]
}

export function classColorFor(data: Pick<TimetableData, 'classColors'>, className: string): string {
  const trimmed = className.trim()
  return data.classColors[trimmed] ?? autoClassColor(trimmed)
}

export function cellKey(dayIndex: number, period: number): string {
  return `${dayIndex}-${period}`
}

export function isEmptyCell(cell: TimetableCell | undefined): boolean {
  if (!cell) return true
  return !cell.subject.trim() && !cell.className.trim() && !cell.room.trim() && !cell.note.trim()
}

export async function getTimetable(uid: string): Promise<TimetableData> {
  const snapshot = await getDoc(timetableRef(uid))
  if (!snapshot.exists()) {
    return { periods: DEFAULT_PERIODS, cells: {}, classColors: {}, periodTimes: {} }
  }
  const data = snapshot.data()
  return {
    periods: typeof data.periods === 'number' ? data.periods : DEFAULT_PERIODS,
    cells: (data.cells as Record<string, TimetableCell>) ?? {},
    classColors: (data.classColors as Record<string, string>) ?? {},
    periodTimes: (data.periodTimes as Record<number, string>) ?? {},
  }
}

/**
 * 칸 하나만 저장한다.
 *
 * **여기는 CHICODE 가 실제로 버그를 겪고 실측으로 고친 자리다. 그대로 둘 것.**
 *
 * 처음엔 `setDoc(ref, { [`cells.${key}`]: cell }, { merge: true })` 로 썼는데,
 * 저장은 오류 없이 성공하는데 새로고침하면 값이 사라졌다. 원인은 setDoc +
 * merge:true 에서는 점(.)이 든 키가 updateDoc 과 달리 중첩 경로로 풀리지 않고
 * `"cells.0-1"` 이라는 점이 그대로 박힌 별도의 최상위 필드로 저장되기 때문이다.
 * cells 맵 자체는 건드려지지 않는다.
 *
 * updateDoc 은 점 표기를 진짜 중첩 경로로 해석해서 그 칸만 정확히 덮어쓰고
 * 다른 칸은 그대로 둔다. 이게 맞는 방법이다.
 *
 * 다만 updateDoc 은 문서가 아직 없으면 not-found 로 실패한다. 그래서 시간표를
 * 처음 쓰는 순간에만 setDoc + **진짜 중첩 객체**로 새로 만든다 — 점 표기 키가
 * 아니라 실제 JS 중첩 객체(`{ cells: { [key]: cell } }`)면 merge:true 와 함께
 * 써도 다른 칸을 지우지 않는다.
 */
export async function saveCell(uid: string, key: string, cell: TimetableCell): Promise<void> {
  const ref = timetableRef(uid)
  try {
    await updateDoc(ref, { [`cells.${key}`]: cell })
  } catch (caught) {
    if ((caught as { code?: string }).code !== 'not-found') throw caught
    await setDoc(ref, { cells: { [key]: cell } }, { merge: true })
  }
}

export async function clearCell(uid: string, key: string): Promise<void> {
  await saveCell(uid, key, EMPTY_CELL)
}

/**
 * 반 이름에 색을 지정하거나(색을 넘김), 지정을 지워 자동 색으로 되돌린다
 * (color 를 null 로 넘김). saveCell 과 같은 이유로 점 표기 + not-found 폴백.
 */
export async function setClassColor(
  uid: string,
  className: string,
  color: string | null,
): Promise<void> {
  const trimmed = className.trim()
  if (!trimmed) return
  const ref = timetableRef(uid)
  const value = color ?? deleteField()
  try {
    await updateDoc(ref, { [`classColors.${trimmed}`]: value })
  } catch (caught) {
    if ((caught as { code?: string }).code !== 'not-found') throw caught
    // 문서가 없다는 건 지정된 색도 없다는 뜻이니 지우기는 그냥 끝낸다.
    if (color === null) return
    await setDoc(ref, { classColors: { [trimmed]: color } }, { merge: true })
  }
}

/** 교시 하나의 시간 표시를 저장한다(빈 문자열이면 지운다). */
export async function setPeriodTime(uid: string, period: number, time: string): Promise<void> {
  const trimmed = time.trim()
  const ref = timetableRef(uid)
  const value = trimmed ? trimmed : deleteField()
  try {
    await updateDoc(ref, { [`periodTimes.${period}`]: value })
  } catch (caught) {
    if ((caught as { code?: string }).code !== 'not-found') throw caught
    if (!trimmed) return
    await setDoc(ref, { periodTimes: { [period]: trimmed } }, { merge: true })
  }
}

export async function setPeriods(uid: string, periods: number): Promise<void> {
  const clamped = Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, Math.round(periods)))
  await setDoc(timetableRef(uid), { periods: clamped }, { merge: true })
}

export { MIN_PERIODS, MAX_PERIODS }
