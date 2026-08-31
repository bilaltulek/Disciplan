import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Timeline from './pages/Timeline';
import History from './pages/History';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Assistant from './pages/Assistant';
import { DEFAULT_SETTINGS } from './shared/settings/defaults';
import type { ReactNode } from 'react';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" />;
};

const RouteFallback = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  if (!user) return <Navigate to="/" replace />;
  const startPage = settings.start_page || DEFAULT_SETTINGS.start_page;
  return <Navigate to={`/${startPage}`} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/assistant" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
    <Route path="/timeline" element={<ProtectedRoute><Timeline /></ProtectedRoute>} />
    <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    <Route path="*" element={<RouteFallback />} />
  </Routes>
);

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <SettingsProvider>
          <AppRoutes />
        </SettingsProvider>
      </AuthProvider>
    </Router>
  );
}
