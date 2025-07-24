import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Header } from './components/Header';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { ProjectSettings } from './pages/ProjectSettings';
import { ErrorPage } from './pages/ErrorPage';

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Header />
        <main className="main">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/project/:projectId" element={
              <ProtectedRoute>
                <ProjectSettings />
              </ProtectedRoute>
            } />
            <Route path="/error" element={<ErrorPage />} />
            <Route path="*" element={<ErrorPage />} errorElement={<ErrorPage />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;