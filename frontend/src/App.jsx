import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext'; // Import new context
import { SettingsProvider, useSettings } from './context/SettingsContext';

import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Timeline from './pages/Timeline';
import History from './pages/History';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import { DEFAULT_SETTINGS } from './shared/settings/defaults';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  return children;
};

const RouteFallback = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  if (!user) return <Navigate to="/" replace />;

  const startPage = settings?.start_page || DEFAULT_SETTINGS.start_page;
  const allowed = new Set(['dashboard', 'timeline', 'history']);
  return <Navigate to={allowed.has(startPage) ? `/${startPage}` : '/dashboard'} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      
      {/* Protect these routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      } />
      <Route path="/timeline" element={
        <ProtectedRoute><Timeline /></ProtectedRoute>
      } />
      <Route path="/history" element={
        <ProtectedRoute><History /></ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute><Profile /></ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute><Settings /></ProtectedRoute>
      } />
      <Route path="*" element={<RouteFallback />} />
    </Routes>
  );
};

function App() {
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

export default App;
