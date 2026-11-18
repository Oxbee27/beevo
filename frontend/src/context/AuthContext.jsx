import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  getCurrentUserService,
  loginService,
  logoutService,
} from '../features/authentication/services/auth.service.js'
import { tokenStorage } from '../services/storage/token-storage.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      if (!tokenStorage.get()) {
        setIsLoading(false)
        return
      }

      try {
        const currentUser = await getCurrentUserService()

        if (active) {
          setUser(currentUser)
        }
      } catch {
        tokenStorage.clear()

        if (active) {
          setUser(null)
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const authenticatedUser = await loginService(credentials)
    setUser(authenticatedUser)
    return authenticatedUser
  }, [])

  const logout = useCallback(() => {
    logoutService()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// This module also exports the shared authentication hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }

  return context
}
