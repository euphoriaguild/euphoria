import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Sidebar } from './components/Sidebar'

import { Landing }      from './pages/Landing'
import { AuthCallback } from './pages/AuthCallback'
import { SetupProfile } from './pages/SetupProfile'
import { Pending }      from './pages/Pending'
import { Onboarding }   from './pages/Onboarding'

import { Dashboard }  from './pages/Dashboard'
import { Members }    from './pages/Members'
import { Rankings }   from './pages/Rankings'
import { Events }     from './pages/Events'
import { WorldBoss }  from './pages/WorldBoss'
import { Raffle }     from './pages/Raffle'
import { Donations }  from './pages/Donations'
import { Alts }       from './pages/Alts'
import { Profile }    from './pages/Profile'
import { GuildPage }  from './pages/GuildPage'
import { Requests }   from './pages/Requests'
import { Presenca }   from './pages/Presenca'
import { Statute }    from './pages/Statute'

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  )
}

function Protected({ children, staff = false }: { children: React.ReactNode; staff?: boolean }) {
  return <ProtectedRoute requireStaff={staff}><AppLayout>{children}</AppLayout></ProtectedRoute>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar"        element={<Landing />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/configurar"    element={<SetupProfile />} />
          <Route path="/pendente"      element={<Pending />} />
          <Route path="/onboarding"    element={<Onboarding />} />

          <Route path="/"                element={<Protected><Dashboard /></Protected>} />
          <Route path="/membros"         element={<Protected><Members /></Protected>} />
          <Route path="/rankings"        element={<Protected><Rankings /></Protected>} />
          <Route path="/guilda/:name"    element={<Protected><GuildPage /></Protected>} />
          <Route path="/eventos"         element={<Protected><Events /></Protected>} />
          <Route path="/world-boss"      element={<Protected><WorldBoss /></Protected>} />
          <Route path="/sorteio"         element={<Protected><Raffle /></Protected>} />
          <Route path="/doacoes"         element={<Protected><Donations /></Protected>} />
          <Route path="/contas-alts"     element={<Protected><Alts key="euphoria" fixedSide="euphoria" /></Protected>} />
          <Route path="/blacklist"       element={<Protected><Alts key="blacklist" fixedSide="blacklist" /></Protected>} />
          <Route path="/presenca"        element={<Protected><Presenca /></Protected>} />
          <Route path="/estatuto"        element={<Protected><Statute /></Protected>} />
          <Route path="/perfil"          element={<Protected><Profile /></Protected>} />
          <Route path="/perfil/:name"    element={<Protected><Profile /></Protected>} />

          <Route path="/solicitacoes" element={<Protected staff><Requests /></Protected>} />

          <Route path="*" element={<Protected><Dashboard /></Protected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
