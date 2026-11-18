import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function PublicOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm-ivory">
        <p className="text-sm font-medium text-inkberry/60">
          Preparing Beevo…
        </p>
      </div>
    )
  }

  return isAuthenticated ? <Navigate to="/" replace /> : <Outlet />
}
