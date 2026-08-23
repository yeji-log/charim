/**
 * 수업 내용 항목에 붙이는 유튜브 영상 링크.
 *
 * mp4 첨부(attachments.ts)와 나눠 쓴다. 첨부는 Firestore 문서 조각으로
 * 저장하는 구조라 **스트리밍이 안 되고**(재생 전 전체 내려받기) 50MB 로
 * 제한된다. 한 차시짜리 영상은 애초에 그 방식으로 못 올리므로, 유튜브에
 * 올려둔 것은 주소만 저장하고 재생은 유튜브 서버에 맡긴다 — Firestore 에는
 * 문자열 하나만 남는다.
 *
 * **이 기능은 개인정보처리방침 제5조와 묶여 있다.** 임베드된 페이지를 여는
 * 것만으로 학생 브라우저가 유튜브 서버에 직접 접속하므로, 차림이 보내는 게
 * 아니어도 IP·브라우저 정보가 그쪽으로 간다. 방침에 그 사실을 적어뒀다 —
 * 임베드를 손볼 때 그 조문도 함께 볼 것.
 */

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'])

/**
 * 여러 형태의 유튜브 주소에서 영상 id 를 뽑는다. 못 알아보면 null —
 * 화면에서 "링크를 다시 확인해 주세요" 안내에 쓴다.
 *
 * 지원: `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`.
 * `www.`·`m.` 유무와 뒤에 붙는 쿼리(재생목록·타임스탬프)는 무시한다.
 */
export function extractYoutubeId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') {
    return parsed.pathname.slice(1).split('/')[0] || null
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v')
    const matched = parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)
    if (matched) return matched[1]
  }

  return null
}

/**
 * `youtube-nocookie.com` 을 쓴다 — 재생을 시작하기 전까지 추적 쿠키를 남기지
 * 않는다는 유튜브 쪽 안내를 따른 것이다. 학생은 로그인도 하지 않는데 괜히
 * 쿠키를 남길 이유가 없다.
 */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}
