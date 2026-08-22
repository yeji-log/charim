/**
 * 수업기록(반별 학생 명단 + 날짜별 참여 여부) 데이터 계층.
 *
 * 학생의 학번·이름은 미성년자 개인정보다. 과목·자료의 핀 같은 "가벼운 잠금"이
 * 아니라 시간표와 동일하게 firestore.rules 에서 읽기까지 막는다 — 학생은 이
 * 데이터의 존재 자체를 모른다.
 *
 *   workspaces/{wsId}/classes/{classId}        반 하나 (예: "2학년 3반")
 *     students/{studentId}                     학생 (id 는 crypto.randomUUID())
 *     records/{uid}/dates/{date}               ★ 교사별 참여 기록
 *
 * ## CHICODE 와 갈리는 두 지점
 *
 * 1. **반은 담당 교사끼리 공유한다.** 문서의 `teacherUids` 에 담긴 교사만
 *    보고 고칠 수 있다. 단수 소유자가 아니라 목록인 이유는 한 반에 국어·수학·
 *    영어 교사가 함께 들어가기 때문이다. 명단을 한 명이 만들어두면 나머지가
 *    그대로 쓴다 — 학교 단위로 묶은 실질적 이득이 이것이다.
 *
 * 2. **참여 기록은 교사마다 따로 둔다.** 같은 반이어도 교사마다 다른 시간에
 *    다른 걸 기록하므로, 한 문서에 섞으면 국어 시간 기록과 수학 시간 기록이
 *    엉킨다. 그래서 명단(students)은 공용이고 기록(dates)만 uid 아래로 내렸다.
 *
 * dates/{date} 의 `records` 필드는 `{ [studentId]: boolean }` 맵이다(참여=true).
 * 새 학생은 지난 날짜에 키가 없을 수 있는데(그때는 반에 없었으니까) 그 경우
 * "참여"로 본다 — isParticipating 참고.
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { db } from './firebase'
import { wsPath } from './workspace'

export interface ClassMeta {
  id: string
  name: string
  order: number
  /** 반 전체에 대한 자유 메모. 특정 학생·날짜에 매이지 않는다. */
  memo?: string
  /** 이 반을 담당하는 교사들의 uid. 여기 없는 교사에게는 보이지도 않는다. */
  teacherUids: string[]
}

export interface Student {
  id: string
  studentNumber: string
  name: string
  order: number
}

export interface DateRecord {
  id: string
  date: string
  /** 학생 id -> 참여 여부. 키가 없으면 참여로 본다. */
  records: Record<string, boolean>
}

export function isParticipating(dateRecord: DateRecord, studentId: string): boolean {
  return dateRecord.records[studentId] ?? true
}

const classesRef = () => collection(db, ...wsPath('classes'))
const classRef = (classId: string) => doc(db, ...wsPath('classes', classId))
const studentsRef = (classId: string) => collection(db, ...wsPath('classes', classId, 'students'))
const studentRef = (classId: string, studentId: string) =>
  doc(db, ...wsPath('classes', classId, 'students', studentId))

/** 참여 기록은 교사별이다 — classes/{classId}/records/{uid}/dates. */
const datesRef = (classId: string, uid: string) =>
  collection(db, ...wsPath('classes', classId, 'records', uid, 'dates'))
const dateRef = (classId: string, uid: string, dateId: string) =>
  doc(db, ...wsPath('classes', classId, 'records', uid, 'dates', dateId))

/**
 * 내가 담당하는 반만 가져온다.
 *
 * 규칙은 목록 조회를 대신 걸러주지 않는다 — 조건에 맞지 않는 문서가 하나라도
 * 결과에 들어가면 질의 전체가 거부될 뿐이다. 그래서 array-contains 제약을
 * 반드시 넣어야 하고, 규칙이 같은 조건을 강제한다.
 *
 * 정렬은 클라이언트에서 한다. where + orderBy 를 함께 쓰면 Firestore 가 복합
 * 색인을 요구한다.
 */
export async function listClasses(uid: string): Promise<ClassMeta[]> {
  const snapshot = await getDocs(query(classesRef(), where('teacherUids', 'array-contains', uid)))
  return snapshot.docs
    .map((entry) => {
      const data = entry.data()
      return {
        id: entry.id,
        name: data.name as string,
        order: (data.order as number) ?? 0,
        memo: data.memo as string | undefined,
        teacherUids: (data.teacherUids as string[]) ?? [],
      }
    })
    .sort((a, b) => a.order - b.order)
}

export async function createClass(uid: string, name: string): Promise<ClassMeta> {
  const existing = await listClasses(uid)
  const order = existing.reduce((max, entry) => Math.max(max, entry.order ?? 0), -1) + 1
  const id = crypto.randomUUID()
  const meta = { name: name.trim(), order, teacherUids: [uid] }
  await setDoc(classRef(id), meta)
  return { id, ...meta }
}

export async function renameClass(classId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await updateDoc(classRef(classId), { name: trimmed })
}

export async function setClassMemo(classId: string, memo: string): Promise<void> {
  await updateDoc(classRef(classId), { memo: memo.trim() })
}

/** 반 순서를 저장한다. 한 번에 커밋해서 중간에 끊긴 순서가 남지 않게 한다. */
export async function reorderClasses(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db)
  orderedIds.forEach((id, index) => batch.update(classRef(id), { order: index }))
  await batch.commit()
}

/** 담당 교사를 추가한다. 그 순간부터 상대에게도 이 반이 보인다. */
export async function addClassTeacher(classId: string, uid: string): Promise<void> {
  const snapshot = await getDoc(classRef(classId))
  const current = (snapshot.data()?.teacherUids as string[]) ?? []
  if (current.includes(uid)) return
  await updateDoc(classRef(classId), { teacherUids: [...current, uid] })
}

/**
 * 담당에서 뺀다. 마지막 한 명은 뺄 수 없다 — 아무도 담당이 아닌 반은 누구에게도
 * 보이지 않아서 되살릴 방법이 없다(콘솔로 들어가야 한다).
 */
export async function removeClassTeacher(classId: string, uid: string): Promise<void> {
  const snapshot = await getDoc(classRef(classId))
  const current = (snapshot.data()?.teacherUids as string[]) ?? []
  const next = current.filter((entry) => entry !== uid)
  if (next.length === 0) throw new Error('담당 교사가 최소 한 명은 있어야 합니다.')
  await updateDoc(classRef(classId), { teacherUids: next })
}

/**
 * 반을 통째로 지운다.
 *
 * Firestore 는 상위 문서를 지워도 하위 컬렉션이 따라 지워지지 않는다. 학생
 * 개인정보가 남지 않게 직접 다 지운다. 다만 **다른 교사의 기록(records/{남의
 * uid})은 지울 수 없다** — 규칙이 남의 기록 쓰기를 막기 때문이다. 그쪽에는
 * `{UUID: boolean}` 만 남는데, 이름도 학번도 없는 무의미한 값이라 개인정보가
 * 되지 않는다. 이름과 학번이 있는 곳은 students 뿐이고 그건 여기서 지운다.
 */
export async function deleteClass(uid: string, classId: string): Promise<void> {
  const [studentsSnapshot, datesSnapshot] = await Promise.all([
    getDocs(studentsRef(classId)),
    getDocs(datesRef(classId, uid)),
  ])
  const batch = writeBatch(db)
  studentsSnapshot.docs.forEach((entry) => batch.delete(entry.ref))
  datesSnapshot.docs.forEach((entry) => batch.delete(entry.ref))
  batch.delete(classRef(classId))
  await batch.commit()
}

export async function listStudents(classId: string): Promise<Student[]> {
  const snapshot = await getDocs(query(studentsRef(classId), orderBy('order', 'asc')))
  return snapshot.docs.map((entry) => ({
    id: entry.id,
    ...(entry.data() as Omit<Student, 'id'>),
  }))
}

export async function addStudent(
  classId: string,
  studentNumber: string,
  name: string,
): Promise<Student> {
  const existing = await listStudents(classId)
  const order = existing.reduce((max, entry) => Math.max(max, entry.order ?? 0), -1) + 1
  const id = crypto.randomUUID()
  const student = { studentNumber: studentNumber.trim(), name: name.trim(), order }
  await setDoc(studentRef(classId, id), student)
  return { id, ...student }
}

interface ParsedStudentLine {
  studentNumber: string
  name: string
}

/**
 * "학번 이름" 한 줄씩 붙여넣은 텍스트를 파싱한다.
 *
 * 엑셀에서 두 칸을 긁어 붙여넣으면 탭으로 구분되고, 직접 타이핑하면 보통 공백
 * 이나 쉼표로 구분하니 셋 다 받는다. 토큰이 2개 미만인 줄(학번만 있거나 빈
 * 줄)은 건너뛰고 개수를 센다 — 조용히 버리면 몇 명이 빠졌는지 모른다.
 */
function parseBulkStudents(raw: string): { entries: ParsedStudentLine[]; invalidLines: number } {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const entries: ParsedStudentLine[] = []
  let invalidLines = 0

  for (const line of lines) {
    const tokens = line.split(/[\t,]+|\s+/).filter(Boolean)
    if (tokens.length < 2) {
      invalidLines += 1
      continue
    }
    const [studentNumber, ...rest] = tokens
    entries.push({ studentNumber, name: rest.join(' ') })
  }
  return { entries, invalidLines }
}

export interface BulkAddResult {
  added: number
  skippedDuplicate: number
  skippedInvalid: number
}

/**
 * 학번·이름을 한 번에 여러 명 추가한다. 이미 있는 학번은 건너뛴다 — 실수로
 * 같은 명단을 두 번 붙여넣어도 중복 학생이 생기지 않는다.
 */
export async function addStudentsBulk(classId: string, raw: string): Promise<BulkAddResult> {
  const { entries, invalidLines } = parseBulkStudents(raw)
  const existing = await listStudents(classId)
  const existingNumbers = new Set(existing.map((entry) => entry.studentNumber))
  let nextOrder = existing.reduce((max, entry) => Math.max(max, entry.order ?? 0), -1) + 1

  const batch = writeBatch(db)
  let added = 0
  let skippedDuplicate = 0

  for (const entry of entries) {
    if (existingNumbers.has(entry.studentNumber)) {
      skippedDuplicate += 1
      continue
    }
    // 붙여넣은 목록 안에서 같은 학번이 겹쳐도 한 번만 추가한다.
    existingNumbers.add(entry.studentNumber)
    batch.set(studentRef(classId, crypto.randomUUID()), {
      studentNumber: entry.studentNumber,
      name: entry.name,
      order: nextOrder,
    })
    nextOrder += 1
    added += 1
  }
  if (added > 0) await batch.commit()

  return { added, skippedDuplicate, skippedInvalid: invalidLines }
}

/**
 * 학생을 명단에서 지운다. 내 날짜 기록에서도 그 항목을 지운다 — 안 지우면
 * 나간 학생의 참여 기록이 고아로 남는다.
 */
export async function deleteStudent(
  uid: string,
  classId: string,
  studentId: string,
): Promise<void> {
  const dates = await listDates(uid, classId)
  const batch = writeBatch(db)
  batch.delete(studentRef(classId, studentId))
  dates.forEach((entry) => {
    if (studentId in entry.records) {
      batch.update(dateRef(classId, uid, entry.id), {
        [`records.${studentId}`]: deleteField(),
      })
    }
  })
  await batch.commit()
}

export async function listDates(uid: string, classId: string): Promise<DateRecord[]> {
  const snapshot = await getDocs(query(datesRef(classId, uid), orderBy('date', 'asc')))
  return snapshot.docs.map((entry) => {
    const data = entry.data()
    return {
      id: entry.id,
      date: data.date as string,
      records: (data.records as Record<string, boolean>) ?? {},
    }
  })
}

/**
 * 새 수업 날짜를 만든다. 이미 있으면 있는 그대로 돌려주고 새로 만들지 않는다 —
 * 같은 날짜를 두 번 눌러 기존 기록을 덮어쓰면 안 된다. 문서 id 를 날짜 문자열
 * ("2026-08-23")로 두어 이 확인이 조회 한 번으로 끝나고, 정렬도 자연스럽다.
 */
export async function createDate(
  uid: string,
  classId: string,
  date: string,
  studentIds: string[],
): Promise<DateRecord> {
  const ref = dateRef(classId, uid, date)
  const existing = await getDoc(ref)
  if (existing.exists()) {
    return { id: date, date, records: (existing.data().records as Record<string, boolean>) ?? {} }
  }
  const records = Object.fromEntries(studentIds.map((id) => [id, true]))
  await setDoc(ref, { date, records })
  return { id: date, date, records }
}

export async function deleteDate(uid: string, classId: string, dateId: string): Promise<void> {
  await deleteDoc(dateRef(classId, uid, dateId))
}

/**
 * 참여 여부를 토글한다.
 *
 * 날짜 문서는 createDate 로 이미 만들어진 뒤에만 눌릴 수 있으므로(그리드에 안
 * 뜨는 날짜는 누를 수 없다) timetable 의 saveCell 과 달리 not-found 폴백이
 * 필요 없다. 점 표기 updateDoc 을 쓰는 이유는 같다 — 한 칸만 정확히 덮어쓴다.
 */
export async function setAttendance(
  uid: string,
  classId: string,
  dateId: string,
  studentId: string,
  participated: boolean,
): Promise<void> {
  await updateDoc(dateRef(classId, uid, dateId), {
    [`records.${studentId}`]: participated,
  })
}
