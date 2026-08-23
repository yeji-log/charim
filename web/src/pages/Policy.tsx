import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import PrivacyPolicy, { PRIVACY_POLICY_EFFECTIVE_DATE } from '../content/PrivacyPolicy'
import TermsOfService, { TERMS_OF_SERVICE_EFFECTIVE_DATE } from '../content/TermsOfService'

/**
 * 정책 문서 화면.
 *
 * CHICODE 는 이걸 모달로 띄웠다. 차림은 주소를 가진 화면으로 둔다 — 과목 편집
 * 화면에서와 같은 이유(모바일에서 뒤로 가기로 나갈 수 있고, 모달이 겹치지
 * 않는다)에 하나가 더 있다. **정책 문서는 링크로 보낼 수 있어야 한다.** 학생이나
 * 보호자가 "어디에 적혀 있느냐"고 물으면 /privacy 한 줄을 주면 끝난다. 모달은
 * 주소가 없어서 "홈에 가서 아래로 내려 풋터의 버튼을 누르세요"가 된다.
 */
function PolicyPage({
  title,
  effectiveDate,
  children,
}: {
  title: string
  effectiveDate: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 border-b border-line pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark">{title}</h1>
        <p className="mt-1 text-sm text-muted">시행일 {effectiveDate}</p>
      </header>

      <div className="rounded-2xl border border-line bg-surface px-5 py-6 sm:px-8 sm:py-8">
        {children}

        <div className="mt-8 border-t border-line pt-4 text-xs text-secondary">
          <p className="font-semibold text-muted">부칙</p>
          <p>이 문서는 {effectiveDate}부터 시행됩니다.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link to="/privacy" className="font-semibold text-primary hover:underline">
          개인정보처리방침
        </Link>
        <Link to="/terms" className="font-semibold text-primary hover:underline">
          이용약관
        </Link>
        <Link to="/" className="ml-auto text-muted hover:text-text">
          홈으로
        </Link>
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <PolicyPage title="개인정보처리방침" effectiveDate={PRIVACY_POLICY_EFFECTIVE_DATE}>
      <PrivacyPolicy />
    </PolicyPage>
  )
}

export function TermsPage() {
  return (
    <PolicyPage title="이용약관" effectiveDate={TERMS_OF_SERVICE_EFFECTIVE_DATE}>
      <TermsOfService />
    </PolicyPage>
  )
}
