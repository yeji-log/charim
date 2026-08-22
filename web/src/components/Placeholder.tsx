import { CharimSymbol } from './Logo'

/**
 * 아직 만들지 않은 화면의 자리표시. 골격 단계에서 레이아웃·색·서체가 실제로
 * 어떻게 보이는지 확인하려고 둔다 — 각 단계가 끝날 때마다 하나씩 교체된다.
 */
export default function Placeholder({
  title,
  description,
  step,
}: {
  title: string
  description: string
  /** 핵심기능_명세.md 7절의 몇 번째 단계에서 만들어지는 화면인지. */
  step: string
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-10 text-center">
      <CharimSymbol className="mx-auto size-10 text-secondary" />
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-text">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[0.95rem] leading-relaxed text-muted">
        {description}
      </p>
      <p className="mt-6 inline-block rounded-full bg-primary-tint px-3 py-1 text-xs font-semibold text-primary-dark">
        {step}
      </p>
    </section>
  )
}
