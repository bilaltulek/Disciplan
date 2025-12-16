import React from 'react';
import { Routes, Route } from 'react-router-dom';

// Import your pages
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Timeline from './pages/Timeline';
import History from './pages/History';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage'

function App() {
  return (
    <Routes>
      {/* The Public Home Page */}
      <Route path="/" element={<LandingPage />} />

      {/* The App Pages */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/timeline" element={<Timeline />} />
      <Route path="/history" element={<History />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      
      {/* Placeholders for now */}
      <Route path="/profile" element={<div className="p-10">Profile Page (Coming Soon)</div>} />
      <Route path="/settings" element={<div className="p-10">Settings Page (Coming Soon)</div>} />
    </Routes>
  );
}

export default App;