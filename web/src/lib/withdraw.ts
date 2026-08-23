/**
 * 교사 탈퇴 — 내 계정과 내가 만든 것을 전부 지운다.
 *
 * ── 왜 콘솔이 아니라 화면에서 하는가 ──
 * 지금까지는 개인정보처리방침 제7조가 "등록 해제를 원하면 연락처로 문의"라고
 * 안내했다. 관리자가 콘솔에서 지워주는 방식이다. 본인이 직접 지울 수 있으면
 * 그 사이의 기다림이 없어지고, 삭제 요구 절차를 화면으로 보일 수 있다.
 *
 * ── 지우는 순서가 중요하다 ──
 * **Firebase Auth 계정을 가장 마지막에 지운다.** 계정이 사라지는 순간 로그인이
 * 풀려서 firestore.rules 의 isMember() 가 거짓이 되고, 남은 문서를 지울 권한도
 * 함께 사라진다. 그 상태로 실패하면 되살릴 방법이 콘솔뿐이다.
 *
 * 같은 이유로 members/{uid} 도 마지막 직전에 지운다 — 그 문서가 사라지면
 * isMember() 가 거짓이 되어 나머지 삭제가 전부 거부된다.
 *
 * ── 되돌릴 수 없다 ──
 * 백업을 두지 않는다(이용약관 제10조). 이 함수가 끝나면 복구 방법이 없다.
 * 호출부에서 반드시 한 번 더 확인받을 것.
 */
import { deleteUser, reauthenticateWithPopup, type User } from 'firebase/auth'
import { deleteDoc, doc } from 'firebase/firestore'

import { db, googleProvider } from './firebase'
import {
  deleteClass,
  listClasses,
  listDates,
  removeClassTeacher,
  deleteDate,
} from './classRecords'
import { deleteClubWithContents, getMyClub } from './clubs'
import { deleteCourseWithContents, listCoursesByTeacher } from './courses'
import { getMyTeacherPage } from './teacherPages'
import { wsPath } from './workspace'

/** 화면에 진행 상황을 보여주기 위한 단계 이름. */
export type WithdrawStep =
  | '과목과 수업자료'
  | '동아리'
  | '반과 수업기록'
  | '시간표'
  | '공개 주소'
  | '교사 등록'
  | '로그인 계정'

export class WithdrawError extends Error {
  /** 어디까지 지우고 멈췄는지. 다시 시도하면 그 다음부터 이어진다. */
  step: WithdrawStep

  // 생성자 매개변수 속성(readonly step: ...)은 tsconfig 의 erasableSyntaxOnly
  // 가 막는다 — 타입만 지우면 사라지지 않고 런타임 동작을 만드는 문법이라서다.
  constructor(message: string, step: WithdrawStep) {
    super(message)
    this.step = step
  }
}

/**
 * 지금 로그인한 교사를 탈퇴시킨다.
 *
 * 중간에 실패하면 거기서 멈추고 WithdrawError 를 던진다. 이미 지운 것은
 * 되돌리지 않는다 — 되돌릴 방법도 없고, 다시 눌러 이어서 지우는 편이 낫다.
 * 각 단계는 이미 없는 것을 지워도 조용히 끝나도록 짰다.
 */
export async function withdrawTeacher(
  user: User,
  onStep?: (step: WithdrawStep) => void,
): Promise<void> {
  const uid = user.uid
  const run = async (step: WithdrawStep, work: () => Promise<void>) => {
    onStep?.(step)
    try {
      await work()
    } catch (caught) {
      console.error(`탈퇴 실패 — ${step}`, caught)
      throw new WithdrawError(`${step}을(를) 지우는 중에 멈췄습니다.`, step)
    }
  }

  // 내가 만든 수업 콘텐츠. 안 지우면 담당자가 사라져 아무도 못 고치는 고아가
  // 되고, 학생 화면에는 계속 뜬다(사용자 결정, 2026-08-23).
  await run('과목과 수업자료', async () => {
    for (const course of await listCoursesByTeacher(uid)) {
      await deleteCourseWithContents(course.id)
    }
  })

  await run('동아리', async () => {
    const club = await getMyClub(uid)
    if (!club) return
    await deleteClubWithContents(club.id)
  })

  // 반은 함께 쓰는 자산이다. 동료가 남아 있으면 나만 빠지고 명단은 그대로
  // 두되, 내가 마지막 담당이면 학생 명단까지 지운다 — 아무도 담당이 아닌 반은
  // 누구에게도 보이지 않아 콘솔로만 되살릴 수 있고, 거기에는 미성년자의
  // 학번·이름이 들어 있다.
  await run('반과 수업기록', async () => {
    for (const entry of await listClasses(uid)) {
      const others = entry.teacherUids.filter((teacher) => teacher !== uid)
      if (others.length > 0) {
        // 내 참여 기록만 걷어내고 명단은 동료에게 남긴다.
        for (const date of await listDates(uid, entry.id)) {
          await deleteDate(uid, entry.id, date.id)
        }
        await removeClassTeacher(entry.id, uid)
      } else {
        await deleteClass(uid, entry.id)
      }
    }
  })

  await run('시간표', async () => {
    await deleteDoc(doc(db, ...wsPath('timetables', uid)))
  })

  await run('공개 주소', async () => {
    const page = await getMyTeacherPage(uid)
    if (page) await deleteDoc(doc(db, ...wsPath('teacherPages', page.slug)))
  })

  // 여기부터는 되돌릴 수 없는 구간이다. 이 문서가 사라지면 isMember() 가
  // 거짓이 되어 위의 어떤 삭제도 더는 통하지 않는다.
  await run('교사 등록', async () => {
    await deleteDoc(doc(db, ...wsPath('members', uid)))
  })

  await run('로그인 계정', async () => {
    try {
      await deleteUser(user)
    } catch (caught) {
      // Firebase 는 계정 삭제처럼 민감한 조작에 최근 로그인을 요구한다.
      // 오래 켜둔 탭에서 누르면 여기로 온다 — 팝업으로 한 번 더 인증하고
      // 다시 시도한다.
      if ((caught as { code?: string }).code !== 'auth/requires-recent-login') throw caught
      await reauthenticateWithPopup(user, googleProvider)
      await deleteUser(user)
    }
  })
}
