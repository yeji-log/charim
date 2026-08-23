import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import SlideSection from '../components/SlideSection'
import { useLessonScope } from '../lib/lessonScope'
import { getActivity, type Activity, type Section } from '../lib/lessons'

/** 수업 내용 상세. 항목 배열을 순서대로 그린다. */
export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>()
  const scope = useLessonScope()
  const { state: authState } = useAuth()
  const isTeacher = authState === 'teacher'

  const [activity, setActivity] = useState<Activity | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setStatus('loading')

    getActivity(id)
      .then((found) => {
        if (cancelled) return
        setActivity(found)
        setStatus(found ? 'ready' : 'missing')
      })
      .catch((caught) => {
        if (cancelled) return
        console.error('수업 내용 불러오기 실패', caught)
        setStatus('missing')
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (status === 'loading') return <p className="text-muted">불러오는 중…</p>

  // 준비 중인 내용은 교사에게만 보인다. 학생에게는 없는 것과 같게 다룬다 —
  // "준비 중입니다"라고 알려주면 목록에 없는 내용의 존재가 드러난다.
  if (status === 'missing' || !activity || (!activity.published && !isTeacher)) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-10 text-center">
        <p className="font-bold text-text">찾는 {scope.activityNoun}이(가) 없습니다.</p>
        <Link
          to={scope.activitiesPath}
          className="mt-4 inline-block text-sm font-semibold text-primary underline"
        >
          목록으로
        </Link>
      </div>
    )
  }

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link to={scope.activitiesPath} className="text-sm text-muted hover:text-text">
          ← {scope.activityNoun} 목록
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark">{activity.title}</h1>
        {!activity.published && (
          <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-text">
            준비 중입니다. 학생에게는 아직 보이지 않습니다.
          </p>
        )}
        {activity.materialUrl && (
          <a
            href={activity.materialUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="w-fit rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
          >
            참고 자료 열기 ↗
          </a>
        )}
      </header>

      {activity.sections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          아직 내용이 없습니다.
        </p>
      ) : (
        activity.sections.map((section) => (
          <SectionView key={section.id} section={section} activityId={activity.id} />
        ))
      )}
    </article>
  )
}

function SectionView({ section, activityId }: { section: Section; activityId: string }) {
  // 수업자료 항목은 제목을 스스로 그린다 — 제목과 발표 버튼이 한 줄에
  // 있어야 해서, 제목을 여기서 그리면 버튼이 그 아래로 밀린다.
  if (section.kind === 'slides') {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6">
        <SlideSection activityId={activityId} title={section.title} />
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      {section.title && <h2 className="text-lg font-bold text-text">{section.title}</h2>}

      <div className="mt-3">
        {section.kind === 'checklist' ? (
          <ChecklistView items={section.items ?? []} />
        ) : section.isCode ? (
          <CodeBlock content={section.content} />
        ) : (
          <Paragraph content={section.content} />
        )}
      </div>
    </section>
  )
}

/**
 * 줄바꿈을 그대로 살리고 URL 은 링크로 만든다.
 *
 * dangerouslySetInnerHTML 을 쓰지 않는다 — 교사가 쓴 글이라 악의는 없겠지만,
 * 붙여넣기로 딸려 들어온 마크업이 화면을 깨뜨리는 것만으로도 충분히 성가시다.
 */
function Paragraph({ content }: { content: string }) {
  if (!content.trim()) return <p className="text-sm text-muted">(내용 없음)</p>

  return (
    <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-text">
      {content.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-primary underline break-all"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  )
}

/**
 * 코드 블록. 구문 강조는 넣지 않았다 — prismjs 를 더하면 번들이 커지는데,
 * 차림은 과목을 가리지 않는 도구라 코드가 주인공인 화면이 아니다. 필요해지면
 * 그때 더한다. 지금 중요한 건 고정폭 글꼴, 가로 스크롤, 복사 버튼이다.
 */
function CodeBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // https 나 localhost 가 아니면 막힌다. 값은 화면에 다 보이므로 긁어서
      // 복사하면 된다.
      setCopied(false)
    }
  }, [content])

  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-line bg-surface px-2 py-1 text-xs font-semibold text-muted transition-colors hover:border-secondary hover:text-text"
      >
        {copied ? '복사됨' : '복사'}
      </button>
      <pre className="overflow-x-auto rounded-xl bg-bg p-4 pr-16 font-mono text-sm leading-relaxed text-text">
        {content || '(비어 있음)'}
      </pre>
    </div>
  )
}

/**
 * 체크 상태는 교사가 미리 정해둔 안내판이다. 학생은 못 바꾼다 — 학생마다 다른
 * 상태를 저장할 로그인도 저장소도 없다. 그래서 input 이 아니라 표시만 한다.
 */
function ChecklistView({ items }: { items: { id: string; text: string; checked: boolean }[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">(항목 없음)</p>

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2.5 text-[0.95rem]">
          <span
            aria-hidden="true"
            className={[
              'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded border text-xs',
              item.checked
                ? 'border-primary bg-primary text-white'
                : 'border-line bg-surface text-transparent',
            ].join(' ')}
          >
            ✓
          </span>
          <span className={item.checked ? 'text-muted line-through' : 'text-text'}>
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  )
}
