import { Link } from 'react-router-dom'

import { CharimSymbol } from '../components/Logo'

/**
 * 홈은 마지막에서 두 번째로 만든다(명세 7절 8단계) — 다른 화면이 다 있어야
 * 여기에 뭘 모아 보여줄지 정해진다. 지금은 골격의 톤을 확인하기 위한 히어로만
 * 둔다. 완성되면 로그인 상태에 따라 교사용(오늘의 수업·미작성 기록·오늘의
 * 시간표)과 학생용(오늘의 수업·자료 보기) 두 벌로 갈린다.
 */
const CARDS = [
  {
    to: '/materials',
    title: '수업자료',
    description: '과목별 자료와 수업목차를 확인합니다.',
  },
  {
    to: '/club',
    title: '동아리',
    description: '시즌별 활동과 오늘의 미션을 봅니다.',
  },
  {
    to: '/schedule',
    title: '일정',
    description: '시간표를 보고 수업을 기록합니다.',
  },
]

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-line bg-surface px-6 py-14 text-center sm:px-10">
        <CharimSymbol className="mx-auto size-14 text-primary" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-primary-dark sm:text-4xl">
          오늘의 수업을 차리다.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[0.95rem] leading-relaxed text-muted">
          시간표, 수업자료, 수업기록을 한곳에서 준비합니다.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-secondary"
          >
            <h2 className="text-lg font-bold text-text">{card.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{card.description}</p>
          </Link>
        ))}
      </section>
    </div>
  )
}
