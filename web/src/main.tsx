import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import './index.css'
import App from './App'
import { installMapUpsertPolyfill } from './lib/mapUpsertPolyfill'
import { AuthProvider } from './auth/AuthProvider'
import Home from './pages/Home'
import Materials from './pages/Materials'
import CourseGate from './pages/CourseGate'
import MaterialsList from './pages/MaterialsList'
import TeacherPublicPage from './pages/TeacherPublicPage'
import Roadmap from './pages/Roadmap'
import ActivityList from './pages/ActivityList'
import ActivityDetail from './pages/ActivityDetail'
import Club, { ClubHome } from './pages/Club'
import Schedule from './pages/Schedule'
import Teacher from './pages/Teacher'
import TeacherCourseEdit from './pages/TeacherCourseEdit'
import NotFound from './pages/NotFound'

// pdf.js 가 나중에 동적으로 로드되기 전에 미리 채워야 한다 — 안 채우면
// 구형 브라우저(갤럭시 탭 등)에서 발표 화면이 통째로 빈 화면이 된다.
installMapUpsertPolyfill()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<Home />} />

            {/* 교사가 학생에게 알려주는 주소. 그 선생님 과목만 보인다. */}
            <Route path="t/:slug" element={<TeacherPublicPage />} />

            <Route path="materials" element={<Materials />} />

            {/* 핀 게이트를 부모 라우트에 둔다. 자식 경로로 직접 들어와도
                게이트를 건너뛸 수 없고, 탭을 오가도 핀을 다시 묻지 않는다. */}
            <Route path="materials/:courseId" element={<CourseGate />}>
              {/* Roadmap / ActivityList / ActivityDetail 은 아래 club 경로에도
                  같은 컴포넌트로 마운트된다 — useLessonScope 가 courseId 유무로
                  스코프와 문구를 가른다. 화면을 복제하지 않는 게 핵심이다. */}
              <Route index element={<Roadmap />} />
              <Route path="content" element={<ActivityList />} />
              <Route path="content/:id" element={<ActivityDetail />} />
              <Route path="materials" element={<MaterialsList />} />
            </Route>

            <Route path="club" element={<Club />}>
              <Route index element={<ClubHome />} />
              <Route path="seasons" element={<Roadmap />} />
              <Route path="activities" element={<ActivityList />} />
              <Route path="activities/:id" element={<ActivityDetail />} />
            </Route>

            <Route path="schedule" element={<Schedule />} />
            <Route path="teacher" element={<Teacher />} />
            {/* 과목 편집은 모달이 아니라 주소를 가진 화면이다 — 모바일에서
                뒤로 가기로 나갈 수 있고, 모달이 겹치지 않는다. */}
            <Route path="teacher/course/:courseId" element={<TeacherCourseEdit />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
