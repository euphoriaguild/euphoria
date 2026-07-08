import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { ptBR } from '@clerk/localizations'
import App from './App'
import './global.css'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!CLERK_KEY) throw new Error('VITE_CLERK_PUBLISHABLE_KEY não definida no .env')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={CLERK_KEY}
      localization={ptBR}
      appearance={{
        variables: {
          colorPrimary: '#c9a84c',
          colorBackground: '#0d1117',
          colorText: '#f0f4f8',
          colorInputBackground: '#131920',
          colorInputText: '#f0f4f8',
          borderRadius: '8px',
        },
        elements: {
          card: { background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' },
          headerTitle: { color: '#f0f4f8' },
          socialButtonsBlockButton: {
            background: '#1a2332',
            border: '1px solid rgba(255,255,255,0.07)',
            color: '#f0f4f8',
          },
        },
      }}
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>
)
