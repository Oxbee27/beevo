import { createBrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import DashboardPage from '../features/dashboard/pages/DashboardPage.jsx'
import CustomersPage from '../features/customers/pages/CustomersPage.jsx'
import CustomerProfilePage from '../features/customers/pages/CustomerProfilePage.jsx'
import EnquiriesPage from '../features/enquiries/pages/EnquiriesPage.jsx'
import EnquiryProfilePage from '../features/enquiries/pages/EnquiryProfilePage.jsx'
import FollowUpsPage from '../features/follow-ups/pages/FollowUpsPage.jsx'
import FollowUpProfilePage from '../features/follow-ups/pages/FollowUpProfilePage.jsx'
import TeamPage from '../features/team/pages/TeamPage.jsx'
import LoginPage from '../features/authentication/pages/LoginPage.jsx'
import RegisterPage from '../features/authentication/pages/RegisterPage.jsx'
import ProtectedRoute from '../routes/ProtectedRoute.jsx'
import PublicOnlyRoute from '../routes/PublicOnlyRoute.jsx'

// eslint-disable-next-line react-refresh/only-export-components
function ComingSoon({ title }) {
  return (
    <div className="rounded-2xl border border-inkberry/10 bg-white/70 p-8">
      <p className="text-xs font-bold uppercase tracking-wider text-inkberry/50">
        Beevo workspace
      </p>
      <h1 className="mt-2 text-2xl font-bold text-inkberry">{title}</h1>
      <p className="mt-3 text-sm text-inkberry/60">
        This section will be implemented as its own feature module.
      </p>
    </div>
  )
}

const featureRoutes = [
  ['communication', 'Communication'],
  ['products', 'Products'],
  ['wallet', 'Wallet'],
]

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <App />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customers/:id', element: <CustomerProfilePage /> },
          { path: 'enquiries', element: <EnquiriesPage /> },
          { path: 'enquiries/:id', element: <EnquiryProfilePage /> },
          { path: 'follow-ups', element: <FollowUpsPage /> },
          { path: 'follow-ups/:id', element: <FollowUpProfilePage /> },
          { path: 'team', element: <TeamPage /> },
          ...featureRoutes.map(([path, title]) => ({
            path,
            element: <ComingSoon title={title} />,
          })),
        ],
      },
    ],
  },
])
