import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Sidebar } from './components/Sidebar'

// Páginas públicas (não exigem login)
import { Landing }      from './pages/Landing'
import { SetupProfile } from './pages/SetupProfile'
import { Pending }      from './pages/Pending'

// Páginas protegidas (exigem Clerk login + aprovação da staff)
import { Dashboard }  from './pages/Dashboard'
import { Members }    from './pages/Members'
import { Rankings }   from './pages/Rankings'
import { Events }     from './pages/Events'
import { WorldBoss }  from './pages/WorldBoss'
import { Invasions }  from './pages/Invasions'
import { Raffle }     from './pages/Raffle'
import { Profile }    from './pages/Profile'
import { GuildPage }  from './pages/GuildPage'
import { Requests }   from './pages/Requests'

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
    // AuthProvider usa Clerk's useUser internamente para buscar o perfil do Supabase
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/entrar"     element={<Landing />} />
          <Route path="/configurar" element={<SetupProfile />} />
          <Route path="/pendente"   element={<Pending />} />

          {/* Rotas protegidas */}
          <Route path="/"                element={<Protected><Dashboard /></Protected>} />
          <Route path="/membros"         element={<Protected><Members /></Protected>} />
          <Route path="/rankings"        element={<Protected><Rankings /></Protected>} />
          <Route path="/guilda/:name"    element={<Protected><GuildPage /></Protected>} />
          <Route path="/eventos"         element={<Protected><Events /></Protected>} />
          <Route path="/world-boss"      element={<Protected><WorldBoss /></Protected>} />
          <Route path="/invasoes"        element={<Protected><Invasions /></Protected>} />
          <Route path="/sorteio"         element={<Protected><Raffle /></Protected>} />
          <Route path="/perfil"          element={<Protected><Profile /></Protected>} />
          <Route path="/perfil/:name"    element={<Protected><Profile /></Protected>} />

          {/* Staff only */}
          <Route path="/solicitacoes" element={<Protected staff><Requests /></Protected>} />

          {/* Qualquer outra rota → dashboard (com proteção) */}
          <Route path="*" element={<Protected><Dashboard /></Protected>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
