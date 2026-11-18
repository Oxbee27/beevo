import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Topbar() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex min-h-[76px] items-center justify-between border-b border-inkberry/10 bg-warm-ivory px-5 md:px-9">
      <div>
        <p className="text-xs font-medium text-inkberry/50">
          Business workspace
        </p>
        <p className="mt-1 text-sm font-semibold text-inkberry">
          My business
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Notifications"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-inkberry/10 text-lg text-inkberry transition hover:bg-peach-sand"
        >
          ♧
        </button>

        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-peach-sand text-sm font-bold text-inkberry"
          title={user?.name || 'Account'}
        >
          {(user?.name || 'B').trim().charAt(0).toUpperCase()}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-inkberry/15 px-4 py-2.5 text-sm font-semibold text-inkberry transition-colors hover:bg-peach-sand"
        >
          Log out
        </button>
      </div>
    </header>
  )
}
