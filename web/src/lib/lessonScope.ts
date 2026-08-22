import { useParams } from 'react-router-dom'

/**
 * 수업목차·내용 화면 세 개는 **두 곳에 마운트된다** — 과목
 * (`/materials/:courseId/…`)과 동아리(`/club/…`).
 *
 * 두 맥락은 데이터 스코프(courseId 유무), 화면에서 쓰는 말(수업목차·내용 ↔
 * 시즌·활동), 링크 대상만 다르고 나머지는 완전히 같다. 그래서 화면을
 * 복제하지 않고 이 훅 하나로 스코프를 계산해 각자 분기하게 한다.
 *
 * react-router 는 상위 라우트의 param 을 자식에서도 그대로 넘겨주므로,
 * main.tsx 에서 같은 컴포넌트를 두 경로 아래 마운트하기만 하면 courseId 가
 * 자동으로 잡힌다 — 동아리 경로에는 그 param 자체가 없어 항상 undefined 다.
 *
 * **이 구조를 깨지 말 것.** 컬렉션을 과목 밑에 중첩하거나 화면을 복제하면
 * 같은 버그를 두 곳에서 고치게 된다.
 */
export interface LessonScope {
  /** 있으면 과목 스코프, 없으면 동아리. */
  courseId?: string
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
  const { courseId } = useParams<{ courseId?: string }>()

  if (courseId) {
    return {
      courseId,
      seasonNoun: '수업목차',
      activityNoun: '수업 내용',
      // 과목에 들어오면 자료보다 수업목차부터 보게 하려고 index 라우트에 둔다.
      roadmapPath: `/materials/${courseId}`,
      activitiesPath: `/materials/${courseId}/content`,
      activityDetailPath: (id) => `/materials/${courseId}/content/${id}`,
    }
  }

  return {
    courseId: undefined,
    seasonNoun: '시즌',
    activityNoun: '활동',
    roadmapPath: '/club/seasons',
    activitiesPath: '/club/activities',
    activityDetailPath: (id) => `/club/activities/${id}`,
  }
}
