import type { ReactNode } from 'react'

/**
 * 정책 문서의 "제N조" 한 항목.
 *
 * 본문에 목록·표·강조가 섞여도 여백이 일정하게 유지되도록 자식 요소의 스타일을
 * 여기서 한 번에 정한다. 조문마다 클래스를 붙이면 200줄짜리 문서에서 금방
 * 어긋나고, 어긋난 걸 눈으로 찾기도 어렵다.
 */
export default function PolicyArticle({
  num,
  title,
  children,
}: {
  num: string
  title: string
  children: ReactNode
}) {
  return (
    <article className="mb-7 last:mb-0">
      <h2 className="mb-2 flex items-baseline gap-2 text-base font-bold text-text">
        <span className="shrink-0 text-primary">{num}</span>
        {title}
      </h2>
      <div
        className="space-y-2.5 text-sm leading-relaxed text-muted
          [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold
          [&_strong]:text-text [&_ul]:list-disc [&_ul]:pl-5"
      >
        {children}
      </div>
    </article>
  )
}

/** 조문 안에 들어가는 표. 좁은 화면에서 가로로 흐르게 한다. */
export function PolicyTable({
  head,
  rows,
}: {
  head: string[]
  rows: ReactNode[][]
}) {
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[420px] border-collapse text-left text-xs">
        <thead>
          <tr className="bg-bg text-text">
            {head.map((label) => (
              <th key={label} className="px-3 py-2 font-bold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex} className="border-t border-line align-top">
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 leading-relaxed">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
