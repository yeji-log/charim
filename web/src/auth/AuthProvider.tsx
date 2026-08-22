import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

import { auth, db, googleProvider } from '../lib/firebase'
import { wsPath } from '../lib/workspace'

/**
 * 교사 인증.
 *
 * Google 로그인에 성공했다고 교사가 되는 것이 아니다. workspace 의 members 에
 * 자기 uid 문서가 있어야 교사로 인정한다. 문서는 Firebase 콘솔에서 손으로
 * 만든다 — 학교 안에서 몇 명이 쓰는 도구라 자동 가입을 열 이유가 없고, 열면
 * 학교 밖 사람이 들어온다.
 *
 * CHICODE 는 teachers/{이메일} 로 판별했다. 차림이 uid 로 바꾼 이유는 둘이다.
 * (1) 이메일은 바뀐다 — 계정을 옮기면 문서 id 가 통째로 달라진다.
 * (2) 이메일을 문서 id 로 쓰면 그 컬렉션이 곧 학교 교사 이메일 목록이 된다.
 *     규칙이 조금만 헐거워도 전원의 이메일이 샌다.
 *
 * 여기서 하는 확인은 화면을 그리기 위한 것이지 보안 장치가 아니다. 실제 차단은
 * firestore.rules 가 구글 서버에서 한다. 이 코드를 우회해도 아무것도 못 쓴다.
 */

/**
 * 로그인 방식은 팝업으로 통일한다.
 *
 * signInWithRedirect 는 로그인 결과를 돌려받을 때 authDomain 과 실제 배포
 * 도메인 사이를 크로스 오리진 iframe 으로 이어 스토리지에 접근하는데, Chrome
 * 115+ 를 포함한 최신 브라우저가 이 접근을 기본 차단한다. Firebase 공식 문서가
 * 이 증상을 설명하면서 대안으로 팝업을 꼽는다. 팝업은 opener 와 postMessage 로
 * 직접 이어서 이 문제가 없다.
 *
 * CHICODE 에서 갤럭시 탭 로그인이 오류 코드도 없이 조용히 실패하던 걸 실기기로
 * 추적해서 얻은 결론이다. 기기별로 방식을 가르지 말 것.
 */

export type TeacherState = 'loading' | 'anonymous' | 'not-allowed' | 'teacher'

interface AuthContextValue {
  user: User | null
  state: TeacherState
  error: string | null
  signIn: () => Promise<void>
  signOutTeacher: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<TeacherState>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)

      if (!nextUser) {
        setState('anonymous')
        return
      }

      setState('loading')
      try {
        const snapshot = await getDoc(doc(db, ...wsPath('members', nextUser.uid)))
        setState(snapshot.exists() ? 'teacher' : 'not-allowed')
      } catch (caught) {
        // 규칙상 본인 문서만 읽을 수 있으므로, 실패는 대개 "명단에 없다"는 뜻이다.
        console.error('멤버 확인 실패', caught)
        setState('not-allowed')
      }
    })
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? ''

      // 사용자가 직접 창을 닫은 경우는 오류가 아니다.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return

      setError(explainAuthError(code))
    }
  }, [])

  const signOutTeacher = useCallback(async () => {
    await signOut(auth)
    setError(null)
  }, [])

  const value = useMemo(
    () => ({ user, state, error, signIn, signOutTeacher }),
    [user, state, error, signIn, signOutTeacher],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * 로그인 실패 원인을 화면에 그대로 드러낸다.
 *
 * "잠시 후 다시 시도해 주세요" 같은 뭉뚱그린 문구는 대부분 거짓말이다 — 설정이
 * 빠져서 나는 오류는 몇 번을 눌러도 똑같이 실패한다. 무엇을 고쳐야 하는지 적고,
 * 모르는 오류는 코드라도 붙여 내보낸다.
 */
function explainAuthError(code: string): string {
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Google 로그인이 아직 켜져 있지 않습니다. Firebase 콘솔 → Authentication → Sign-in method → Google → 사용 설정을 해주세요.'
    case 'auth/unauthorized-domain':
      return `이 주소(${location.hostname})가 Firebase 에 등록되지 않았습니다. 콘솔 → Authentication → Settings → 승인된 도메인에 추가해 주세요.`
    case 'auth/popup-blocked':
      return '브라우저가 로그인 창을 막았습니다. 주소창 오른쪽의 팝업 차단 아이콘을 눌러 허용해 주세요.'
    case 'auth/network-request-failed':
      return '네트워크 연결에 실패했습니다. 인터넷 연결을 확인해 주세요.'
    default:
      // Firebase 는 잘못된 키에 대해 'auth/api-key-not-valid.-please-pass-a-
      // valid-api-key.' 처럼 문장을 그대로 코드로 만들어 던진다. 정확히 일치
      // 시키려 하지 말고 앞부분만 본다.
      if (code.startsWith('auth/api-key-not-valid') || code === 'auth/invalid-api-key') {
        // 실제로 겪은 사고라서 원인을 문장에 박아둔다. 배포 환경변수에 키를
        // 넣을 때, 화면에 가려져 표시된 값(AIzaSyBu●●●●…)을 그대로 복사해서
        // 붙여넣으면 길이도 앞글자도 진짜와 같아 눈으로는 구분되지 않는다.
        return 'Firebase API 키가 올바르지 않습니다. 배포 환경변수 VITE_FIREBASE_API_KEY 값을 확인해 주세요 — 가려진 채 표시된 값(● 이 섞인 값)을 복사해 넣으면 길이가 같아 눈으로는 구분되지 않습니다.'
      }
      return `로그인에 실패했습니다. (오류 코드: ${code || '알 수 없음'})`
  }
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있습니다.')
  return context
}
