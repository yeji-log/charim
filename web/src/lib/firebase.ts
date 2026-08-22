import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

/**
 * Cloud Storage(getStorage)는 쓰지 않는다 — Firebase 새 프로젝트에서 Storage 를
 * 켜려면 Blaze 유료 플랜이 필요하다. 파일은 Firestore 문서에 base64 조각으로
 * 나눠 넣는다(chunkedFile.ts, 5단계). 나중에 Storage 로 옮기게 되면 그 파일
 * 한 곳만 고치면 되도록 데이터 계층을 얇게 유지한다.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** 설정이 비어 있으면 로그인 화면에서 그 사실을 그대로 알려준다. */
export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId)

const app = initializeApp(config)

export const auth = getAuth(app)
export const db = getFirestore(app)

/**
 * 기본값(indexedDBLocalPersistence)이 아이패드 Safari 에서 signInWithPopup 과
 * 부딪힌다. 팝업이 뜨는 순간 원래 탭이 hidden 으로 처리되는 경우가 있는데,
 * Safari 는 탭이 배경으로 가면 열려 있던 IndexedDB 연결을 강제로 닫아버려서
 * 로그인 결과를 쓰려는 시점에 조용히 실패한다 — 아이폰에서는 재현되지 않고
 * 아이패드에서만 난다. localStorage 기반 영속성은 Safari 가 이렇게 끊지 않는다.
 *
 * CHICODE 에서 실기기로 확인하고 고친 부분이다. 지우지 말 것.
 */
void setPersistence(auth, browserLocalPersistence)

export const googleProvider = new GoogleAuthProvider()
// 계정을 여러 개 쓰는 교사가 매번 계정을 고를 수 있도록.
googleProvider.setCustomParameters({ prompt: 'select_account' })
