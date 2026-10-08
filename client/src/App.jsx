import { Navigate, Route, Routes } from 'react-router-dom';  
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth.jsx';
import { PublicLayout, PortalLayout, AdminLayout } from './components/layouts.jsx';
import { Spinner } from './components/ui.jsx';
import Home from './pages/public/Home.jsx';
import Service from './pages/public/Service.jsx';
import Security from './pages/public/Security.jsx';
import Support from './pages/public/Support.jsx';
import Contact from './pages/public/Contact.jsx';
import { Login, Activate, Forgot, Reset } from './pages/public/Auth.jsx';
import { Dashboard, Accounts, Transactions, Statements, Notifications, Profile, SecurityPage, Settings } from './pages/portal/Portal.jsx';
import { AdminDashboard, Clients, ClientDetail, Staff, Audit, AdminSecurity } from './pages/admin/Admin.jsx';

function Guard({ role, children }) {
  const { user, ready } = useAuth();
  const { t } = useTranslation();
  if (!ready) return <Spinner label={t('common.loading')} />;
  if (!user) return <Navigate to={role === 'client' ? '/login' : '/admin/login'} replace />;
  if (role === 'client' && user.role !== 'client') return <Navigate to="/admin" replace />;
  if (role === 'staff' && user.role === 'client') return <Navigate to="/portal" replace />;
  return children;
}

// Staff must complete MFA enrolment before using anything but their security page.
function StaffGate({ children, security }) {
  const { user } = useAuth();
  if (user.mfaSetupRequired && !security) return <Navigate to="/admin/security" replace />;
  return children;
}

const NotFound = () => { const { t } = useTranslation(); return <div className="container section"><h1>404</h1><p className="muted">{t('common.genericError')}</p></div>; };

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="services/:slug" element={<Service />} />
        <Route path="security" element={<Security />} />
        <Route path="support" element={<Support />} />
        <Route path="contact" element={<Contact />} />
        <Route path="login" element={<Login portal="client" />} />
        <Route path="admin/login" element={<Login portal="admin" />} />
        <Route path="activate" element={<Activate />} />
        <Route path="forgot-password" element={<Forgot />} />
        <Route path="reset-password" element={<Reset />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="portal" element={<Guard role="client"><PortalLayout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="statements" element={<Statements />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="admin" element={<Guard role="staff"><AdminLayout /></Guard>}>
        <Route index element={<StaffGate><AdminDashboard /></StaffGate>} />
        <Route path="clients" element={<StaffGate><Clients /></StaffGate>} />
        <Route path="clients/:id" element={<StaffGate><ClientDetail /></StaffGate>} />
        <Route path="staff" element={<StaffGate><Staff /></StaffGate>} />
        <Route path="audit" element={<StaffGate><Audit /></StaffGate>} />
        <Route path="security" element={<StaffGate security><AdminSecurity /></StaffGate>} />
      </Route>
    </Routes>
  );
}
