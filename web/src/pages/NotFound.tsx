import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-10 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-text">찾는 화면이 없습니다</h1>
      <p className="mt-2 text-[0.95rem] text-muted">주소를 다시 확인해 주세요.</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
      >
        홈으로
      </Link>
    </section>
  )
}
