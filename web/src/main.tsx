import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import Home from './pages/Home'
import Materials from './pages/Materials'
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
            {/* 과목·동아리의 핀 게이트는 각각 부모 라우트로 들어와 <Outlet/> 을
                연다(5·6단계). 그래야 /club/activities 처럼 자식 경로로 직접
                들어와도 핀을 건너뛸 수 없다. */}
            <Route path="materials" element={<Materials />} />
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
