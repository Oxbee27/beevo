import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const primaryItems = [
  { label: 'Home', path: '/', icon: '◫' },
  { label: 'Customers', path: '/customers', icon: '♙' },
  { label: 'Enquiries', path: '/enquiries', icon: '▤' },
  { label: 'Follow-ups', path: '/follow-ups', icon: '◷' },
]

const moreItems = [
  { label: 'Communication', path: '/communication', icon: '✉' },
  { label: 'Communication settings', path: '/communication/settings', icon: '⚙' },
  { label: 'Products', path: '/products', icon: '▧' },
  { label: 'Wallet', path: '/wallet', icon: '◈' },
  { label: 'Team & roles', path: '/team', icon: '♧' },
]

export default function BottomNavigation() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  const moreIsActive = moreItems.some(
    (item) =>
      location.pathname === item.path ||
      location.pathname.startsWith(`${item.path}/`)
  )

  return (
    <>
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close more navigation"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-inkberry/30"
          />

          <section
            id="bottom-more-navigation"
            aria-label="More navigation"
            className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-inkberry/10 bg-white p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-inkberry">More</h2>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close more navigation"
                className="rounded-lg px-3 py-1 text-xl text-inkberry/60 hover:bg-inkberry/5"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-14 items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                      isActive
                        ? 'border-peach-sand bg-peach-sand/60 text-inkberry'
                        : 'border-inkberry/10 text-inkberry hover:bg-warm-ivory'
                    }`
                  }
                >
                  <span className="text-lg" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </section>
        </>
      )}

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-inkberry/10 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(48,38,61,0.07)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {primaryItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setMoreOpen(false)}
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
                    className={`flex h-8 w-10 items-center justify-center rounded-xl text-xl ${
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

          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="bottom-more-navigation"
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex min-h-[66px] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors sm:min-h-[76px] sm:text-xs ${
              moreOpen || moreIsActive
                ? 'text-inkberry'
                : 'text-inkberry/55 hover:bg-warm-ivory hover:text-inkberry'
            }`}
          >
            <span
              className={`flex h-8 w-10 items-center justify-center rounded-xl text-xl ${
                moreOpen || moreIsActive ? 'bg-peach-sand' : ''
              }`}
              aria-hidden="true"
            >
              ⋯
            </span>
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
