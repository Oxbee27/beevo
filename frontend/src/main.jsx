import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './context/AuthContext.jsx'
import CookieConsent from './components/ui/CookieConsent.jsx'
import { router } from './app/router.jsx'
import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>
          <RouterProvider router={router} />
        </GoogleOAuthProvider>
      ) : (
        <RouterProvider router={router} />
      )}
      <CookieConsent />
    </AuthProvider>
  </StrictMode>,
)
