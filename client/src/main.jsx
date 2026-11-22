import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n.jsx';
import { ToastProvider } from './components/ui.jsx';
import { session } from './api.js';
import Landing from './pages/Landing.jsx';
import Register from './pages/Register.jsx';
import Login from './pages/Login.jsx';
import './styles.css';

const AppLayout = lazy(() => import('./pages/app/Layout.jsx'));
const Overview = lazy(() => import('./pages/app/Overview.jsx'));
const Booths = lazy(() => import('./pages/app/Booths.jsx'));
const BoothReport = lazy(() => import('./pages/app/BoothReport.jsx'));
const Voters = lazy(() => import('./pages/app/Voters.jsx'));
const Outreach = lazy(() => import('./pages/app/Outreach.jsx'));
const Team = lazy(() => import('./pages/app/Team.jsx'));
const Billing = lazy(() => import('./pages/app/Billing.jsx'));
const Admin = lazy(() => import('./pages/app/Admin.jsx'));
const Import = lazy(() => import('./pages/app/Import.jsx'));
const CapturePage = lazy(() => import('./pages/app/CapturePage.jsx'));
const Field = lazy(() => import('./pages/Field.jsx'));

function RequireAuth({ children }) {
  return session.get()?.token ? children : <Navigate to="/login" replace />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Suspense fallback={<div className="container" style={{ padding: 40 }}>Loading…</div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/field/:token" element={<Field />} />
              <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
                <Route index element={<Overview />} />
                <Route path="booths" element={<Booths />} />
                <Route path="booths/:no" element={<BoothReport />} />
                <Route path="voters" element={<Voters />} />
                <Route path="outreach" element={<Outreach />} />
                <Route path="team" element={<Team />} />
                <Route path="billing" element={<Billing />} />
                <Route path="admin" element={<Admin />} />
                <Route path="import" element={<Import />} />
                <Route path="capture" element={<CapturePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>
);
