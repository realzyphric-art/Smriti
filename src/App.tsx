import { lazy, Suspense, type ReactNode } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { SettingsProvider, useSettings } from '@/hooks/useSettings';
import { I18nProvider } from '@/i18n';
import { ToastProvider } from '@/hooks/useToast';
import { PatientLayout, CaregiverLayout } from '@/components/Layouts';

import { Welcome } from '@/pages/Welcome';
import { LanguageSelect } from '@/pages/LanguageSelect';
import { PatientHome } from '@/pages/PatientHome';
import { Games } from '@/pages/Games';
import { Reminders } from '@/pages/Reminders';
import { Progress } from '@/pages/Progress';
import { Settings } from '@/pages/Settings';
import { Profiles } from '@/pages/Profiles';
import { People } from '@/pages/People';
import { Emergency } from '@/pages/Emergency';
import { ChooseRole } from '@/pages/ChooseRole';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthPage } from '@/pages/AuthPage';
import { Chat } from '@/pages/Chat';
import { AI_CHAT_ENABLED } from '@/config/features';

const ResetPassword = lazy(() => import('@/pages/ResetPassword').then((module) => ({ default: module.ResetPassword })));
const AdminErrors = lazy(() => import('@/pages/AdminErrors').then((module) => ({ default: module.AdminErrors })));
const GamePlay = lazy(() => import('@/pages/GamePlay').then((module) => ({ default: module.GamePlay })));
const CaregiverOverview = lazy(() => import('@/pages/caregiver/CaregiverOverview').then((module) => ({ default: module.CaregiverOverview })));
const CaregiverProgress = lazy(() => import('@/pages/caregiver/CaregiverProgress').then((module) => ({ default: module.CaregiverProgress })));
const CaregiverAlerts = lazy(() => import('@/pages/caregiver/CaregiverAlerts').then((module) => ({ default: module.CaregiverAlerts })));
const CaregiverPatient = lazy(() => import('@/pages/caregiver/CaregiverPatient').then((module) => ({ default: module.CaregiverPatient })));
const CaregiverSettings = lazy(() => import('@/pages/caregiver/CaregiverSettings').then((module) => ({ default: module.CaregiverSettings })));
const CaregiverReminders = lazy(() => import('@/pages/caregiver/CaregiverReminders').then((module) => ({ default: module.CaregiverReminders })));
const CaregiverEmergency = lazy(() => import('@/pages/caregiver/CaregiverEmergency').then((module) => ({ default: module.CaregiverEmergency })));

/** Bridges settings.language into the i18n provider. */
function I18nBridge({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return <I18nProvider lang={settings.language}>{children}</I18nProvider>;
}

/** Redirects to onboarding if the user hasn't completed it. */
function RequireOnboarded({ children }: { children: ReactNode }) {
  const { settings, authReady } = useSettings();
  const location = useLocation();
  if (!authReady) return <AuthSplash />;
  if (!settings.onboarded || (!settings.authenticated && !settings.guestMode)) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (settings.needsRoleSelection && location.pathname !== '/choose-role') {
    return <Navigate to="/choose-role" replace />;
  }
  return <>{children}</>;
}

function RequireCaregiver({ children }: { children: ReactNode }) {
  const { settings, authReady } = useSettings();
  const location = useLocation();
  if (!authReady) return <AuthSplash />;
  if (!settings.onboarded || !settings.authenticated || settings.role !== 'caregiver') {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (settings.needsRoleSelection) return <Navigate to="/choose-role" replace />;
  return <>{children}</>;
}

/** The landing route decides where an onboarded user should go. */
function LandingRoute() {
  const { settings, authReady } = useSettings();
  if (!authReady) return <AuthSplash />;
  if (settings.guestMode) return <Navigate to="/home" replace />;
  if (settings.onboarded && settings.authenticated) {
    if (settings.needsRoleSelection) return <Navigate to="/choose-role" replace />;
    return (
      <Navigate to={settings.role === 'caregiver' ? '/caregiver' : '/home'} replace />
    );
  }
  return <Welcome />;
}

function AuthSplash() { return <main className="page page--flow"><div className="card text-center stack" role="status"><span className="medallion medallion--green" style={{ alignSelf: 'center' }}>🌿</span><h1>Smriti</h1><p className="text-muted">Preparing your secure space…</p></div></main>; }

function RouteLoading() {
  return <main className="page page--flow"><div className="card text-center stack" role="status" aria-live="polite"><span className="medallion medallion--green" style={{ alignSelf: 'center' }}>🌿</span><h1>Smriti</h1><p className="text-muted">Loading this space…</p></div></main>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/auth" element={isSupabaseConfigured ? <AuthPage /> : <Navigate to="/" replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin/errors" element={<AdminErrors />} />
      <Route path="/language" element={<LanguageSelect />} />
      <Route path="/choose-role" element={<RequireOnboarded><ChooseRole /></RequireOnboarded>} />

      {/* Patient */}
      <Route
        element={
          <RequireOnboarded>
            <PatientLayout />
          </RequireOnboarded>
        }
      >
        <Route path="/home" element={<PatientHome />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/:gameId" element={<GamePlay />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/today" element={<Reminders />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/chat" element={AI_CHAT_ENABLED ? <Chat /> : <Navigate to="/home" replace />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/people" element={<People />} />
      </Route>

      {/* Caregiver */}
      <Route element={<RequireCaregiver><CaregiverLayout /></RequireCaregiver>}>
        <Route path="/caregiver" element={<CaregiverOverview />} />
        <Route path="/caregiver/progress" element={<CaregiverProgress />} />
        <Route path="/caregiver/alerts" element={<CaregiverAlerts />} />
        <Route path="/caregiver/patient" element={<CaregiverPatient />} />
        <Route path="/caregiver/settings" element={<CaregiverSettings />} />
        <Route path="/caregiver/reminders" element={<CaregiverReminders />} />
        <Route path="/caregiver/emergency" element={<CaregiverEmergency />} />
        <Route path="/caregiver/people" element={<People />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <I18nBridge>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteLoading />}>
              <AppRoutes />
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </I18nBridge>
    </SettingsProvider>
  );
}
