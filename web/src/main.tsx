import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import Home from './pages/Home'
import Materials from './pages/Materials'
import CourseGate from './pages/CourseGate'
import MaterialsList from './pages/MaterialsList'
import TeacherPublicPage from './pages/TeacherPublicPage'
import Club from './pages/Club'
import Schedule from './pages/Schedule'
import Teacher from './pages/Teacher'
import NotFound from './pages/NotFound'

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
                게이트를 건너뛸 수 없고, 탭을 오가도 핀을 다시 묻지 않는다.
                6단계에서 수업목차/수업내용이 이 아래에 함께 마운트된다. */}
            <Route path="materials/:courseId" element={<CourseGate />}>
              <Route index element={<MaterialsList />} />
            </Route>

            <Route path="club" element={<Club />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="teacher" element={<Teacher />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
