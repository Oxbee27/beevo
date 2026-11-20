import { Outlet } from 'react-router-dom'
import BottomNavigation from '../components/layout/Sidebar.jsx'
import Topbar from '../components/layout/Topbar.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-warm-ivory">
      <div className="min-h-screen min-w-0">
        <Topbar />

        <main className="min-w-0 px-4 py-6 pb-36 sm:px-5 sm:py-8 sm:pb-32 md:px-9 md:py-10 md:pb-28">
          <Outlet />
        </main>
      </div>

      <BottomNavigation />
    </div>
  )
}
