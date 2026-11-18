import { NavLink } from 'react-router-dom'

const navigation = [
  { label: 'Overview', path: '/', icon: '◫' },
  { label: 'Customers', path: '/customers', icon: '♙' },
  { label: 'Enquiries', path: '/enquiries', icon: '▤' },
  { label: 'Follow-ups', path: '/follow-ups', icon: '◷' },
  { label: 'Communication', path: '/communication', icon: '✉' },
]

const businessNavigation = [
  { label: 'Products', path: '/products', icon: '▧' },
  { label: 'Wallet', path: '/wallet', icon: '◈' },
  { label: 'Team & roles', path: '/team', icon: '♧' },
]

export default function Sidebar() {
  return (
    <aside className="flex w-full flex-col bg-inkberry text-warm-ivory md:fixed md:inset-y-0 md:left-0 md:w-64">
      <div className="flex h-[76px] items-center justify-between border-b border-white/10 px-6">
        <span className="text-[27px] font-extrabold tracking-[-1.5px]">
          beevo<span className="text-peach-sand">.</span>
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-wider text-white/70">
          CRM
        </span>
      </div>

      <div className="px-4 pt-7">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.8px] text-white/40">
          Workspace
        </p>
        <nav className="space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? 'bg-peach-sand text-inkberry'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="w-5 text-center text-lg" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="px-4 pt-8">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.8px] text-white/40">
          Business
        </p>
        <nav className="space-y-1">
          {businessNavigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? 'bg-peach-sand text-inkberry'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="w-5 text-center text-lg" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto hidden p-4 md:block">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold">Stay connected</p>
          <p className="mt-1 text-xs leading-5 text-white/55">
            Every enquiry deserves a follow-up.
          </p>
        </div>
        <p className="mt-5 px-2 text-[11px] text-white/35">Beevo CRM · Version 1.0</p>
      </div>
    </aside>
  )
}
