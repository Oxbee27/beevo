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
import ProductsPage from '../features/products/pages/ProductsPage.jsx'
import CommunicationPage from '../features/communication/pages/CommunicationPage.jsx'
import WalletPage from '../features/wallet/pages/WalletPage.jsx'
import LoginPage from '../features/authentication/pages/LoginPage.jsx'
import RegisterPage from '../features/authentication/pages/RegisterPage.jsx'
import ProtectedRoute from '../routes/ProtectedRoute.jsx'
import PublicOnlyRoute from '../routes/PublicOnlyRoute.jsx'

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
          { path: 'products', element: <ProductsPage /> },
          { path: 'communication', element: <CommunicationPage /> },
          { path: 'wallet', element: <WalletPage /> },
        ],
      },
    ],
  },
])
