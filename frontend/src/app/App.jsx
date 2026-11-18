import { Outlet } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar.jsx'
import Topbar from '../components/layout/Topbar.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-warm-ivory md:pl-64">
      <Sidebar />
      <div className="min-h-screen">
        <Topbar />
        <main className="px-5 py-8 md:px-9 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
