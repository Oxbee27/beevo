import { NavLink } from 'react-router-dom'

const navigation = [
  { label: 'Overview', path: '/', icon: '◫' },
  { label: 'Customers', path: '/customers', icon: '♙' },
  { label: 'Enquiries', path: '/enquiries', icon: '▤' },
  { label: 'Follow-ups', path: '/follow-ups', icon: '◷' },
  { label: 'Communication', path: '/communication', icon: '✉' },
  { label: 'Products', path: '/products', icon: '▧' },
  { label: 'Wallet', path: '/wallet', icon: '◈' },
  { label: 'Team & roles', path: '/team', icon: '♧' },
]

export default function BottomNavigation() {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-inkberry/10 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(48,38,61,0.07)] backdrop-blur"
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-4 sm:grid-cols-8">
        {navigation.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex min-h-[66px] flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[10px] font-medium transition-colors sm:min-h-[76px] sm:text-xs ${
                isActive
                  ? 'text-inkberry'
                  : 'text-inkberry/55 hover:bg-warm-ivory hover:text-inkberry'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-8 w-10 items-center justify-center rounded-xl text-xl transition-colors ${
                    isActive ? 'bg-peach-sand' : ''
                  }`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
