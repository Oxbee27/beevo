import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Topbar() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const displayName = user?.name?.trim() || 'Account'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between border-b border-inkberry/10 bg-warm-ivory px-4 sm:px-5 md:min-h-[76px] md:px-9">
      <div className="min-w-0">
        <p className="text-xs font-medium text-inkberry/50">
          Business workspace
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-inkberry">
          Welcome back, {displayName}
        </p>
      </div>

      <div className="ml-3 flex shrink-0 items-center gap-2 sm:gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-peach-sand text-sm font-bold text-inkberry sm:h-10 sm:w-10"
          title={displayName}
          aria-label={`Signed in as ${displayName}`}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-inkberry/15 px-3 py-2.5 text-xs font-semibold text-inkberry transition-colors hover:bg-peach-sand sm:px-4 sm:text-sm"
        >
          Log out
        </button>
      </div>
    </header>
  )
}
