import { useParams } from 'react-router-dom'

import type { LessonOwner } from './lessons'

/**
 * 수업목차·내용 화면 세 개는 **두 곳에 마운트된다** — 과목
 * (`/materials/:courseId/…`)과 동아리(`/club/:clubId/…`).
 *
 * 두 맥락은 데이터 스코프, 화면에서 쓰는 말(수업목차·내용 ↔ 시즌·활동), 링크
 * 대상만 다르고 나머지는 완전히 같다. 그래서 화면을 복제하지 않고 이 훅 하나로
 * 스코프를 계산해 각자 분기하게 한다.
 *
 * react-router 는 상위 라우트의 param 을 자식에서도 그대로 넘겨주므로,
 * main.tsx 에서 같은 컴포넌트를 두 경로 아래 마운트하기만 하면 courseId 나
 * clubId 중 맞는 쪽이 자동으로 잡힌다.
 *
 * **이 구조를 깨지 말 것.** 컬렉션을 과목 밑에 중첩하거나 화면을 복제하면
 * 같은 버그를 두 곳에서 고치게 된다.
 *
 * 예전에는 "courseId 가 없으면 동아리"로 갈랐다. 동아리가 학교에 하나뿐일 때는
 * param 이 필요 없었기 때문이다. 교사마다 동아리를 갖게 되면서(2026-08-23)
 * 동아리에도 id 가 생겼고, 두 갈래를 둘 다 명시하게 됐다.
 */
export interface LessonScope {
  /** 데이터 계층에 그대로 넘기는 스코프. */
  owner: LessonOwner
  /** '수업목차' | '시즌' */
  seasonNoun: string
  /** '수업 내용' | '활동' */
  activityNoun: string
  /** 수업목차(시즌) 카드 그리드 경로. */
  roadmapPath: string
  /** 내용(활동) 목록 경로. */
  activitiesPath: string
  activityDetailPath: (id: string) => string
}

export function useLessonScope(): LessonScope {
  const { courseId, clubId } = useParams<{ courseId?: string; clubId?: string }>()

  if (courseId) {
    return {
      owner: { courseId },
      seasonNoun: '수업목차',
      activityNoun: '수업 내용',
      // 과목에 들어오면 자료보다 수업목차부터 보게 하려고 index 라우트에 둔다.
      roadmapPath: `/materials/${courseId}`,
      activitiesPath: `/materials/${courseId}/content`,
      activityDetailPath: (id) => `/materials/${courseId}/content/${id}`,
    }
  }

  // clubId 가 없는 경로에 이 훅이 걸릴 일은 없다(라우트가 둘 뿐이다). 그래도
  // 빈 문자열로 두면 질의가 아무것도 못 찾아 빈 화면이 되고, undefined 로
  // 두면 타입이 무너진다 — 빈 스코프가 조용히 남의 자료를 긁어오는 것보다
  // 아무것도 안 나오는 편이 안전하다.
  return {
    owner: { clubId: clubId ?? '' },
    seasonNoun: '시즌',
    activityNoun: '활동',
    roadmapPath: `/club/${clubId}/seasons`,
    activitiesPath: `/club/${clubId}/activities`,
    activityDetailPath: (id) => `/club/${clubId}/activities/${id}`,
  }
}
