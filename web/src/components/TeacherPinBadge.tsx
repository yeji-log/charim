/**
 * 학생 화면 헤더에 붙는, 교사에게만 보이는 핀번호 배지.
 *
 * 교사는 핀 없이 학생 화면에 들어가므로(CourseGate / Club) 정작 학생이
 * "핀번호 뭐예요?"라고 물으면 교사 화면으로 되돌아가서 확인해야 했다.
 * 수업 중에 그 왕복이 제일 성가시다는 이야기라 여기에 값을 그대로 띄운다.
 * CHICODE 의 `SubjectMaterials.tsx` 핀 배지와 같은 물건이다.
 *
 * **호출부에서 교사인지 확인하고 렌더할 것.** 이 컴포넌트는 스스로 로그인
 * 상태를 보지 않는다 — 조건을 호출부에 두면 학생 화면에 실수로 섞여 들어갈
 * 여지가 코드에서 눈에 띈다.
 */
export default function TeacherPinBadge({
  pinRequired,
  pin,
}: {
  pinRequired: boolean
  pin: string
}) {
  // 핀을 안 켰거나 값이 비어 있으면 학생은 그냥 들어온다. 그 상태를 "핀
  // 1234"처럼 보여주면 교사가 잠겨 있다고 착각하므로 문구를 나눈다.
  const open = !pinRequired || !pin.trim()

  return (
    <span
      className={[
        'rounded-lg border px-3 py-1.5 text-sm font-semibold',
        open
          ? 'border-warning/40 bg-warning/10 text-text'
          : 'border-primary-tint bg-primary-tint text-primary-dark',
      ].join(' ')}
    >
      {open ? '🔓 지금은 핀번호 없이 들어올 수 있습니다' : `🔑 학생용 핀번호 ${pin}`}
    </span>
  )
}
