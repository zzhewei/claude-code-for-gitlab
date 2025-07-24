import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh' 
      }}>
        Loading...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '80vh',
      padding: '2rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        padding: '3rem',
        textAlign: 'center',
        maxWidth: '500px',
        width: '100%'
      }}>
        <h1 style={{ marginBottom: '1.5rem', color: '#333' }}>
          Welcome to Claude GitLab App
        </h1>
        
        <p style={{ 
          color: '#6c757d', 
          marginBottom: '2rem',
          lineHeight: '1.6'
        }}>
          Integrate Claude AI with your GitLab projects. Get intelligent assistance on issues, 
          merge requests, and code reviews directly in your GitLab workflow.
        </p>
        
        <a
          href="/auth/gitlab"
          style={{
            display: 'inline-block',
            padding: '0.75rem 2rem',
            background: '#1f75cb',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: '500',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#1b69b6'}
          onMouseOut={(e) => e.currentTarget.style.background = '#1f75cb'}
        >
          🦊 Login with GitLab
        </a>

        <div style={{
          marginTop: '3rem',
          padding: '2rem',
          background: '#f8f9fa',
          borderRadius: '4px',
          textAlign: 'left'
        }}>
          <h3 style={{ marginBottom: '1rem', color: '#333' }}>Features:</h3>
          <ul style={{ 
            listStyle: 'none', 
            padding: 0, 
            margin: 0,
            lineHeight: '1.8'
          }}>
            <li style={{ marginBottom: '0.5rem' }}>💬 Smart comments with @claude</li>
            <li style={{ marginBottom: '0.5rem' }}>🔧 Intelligent code reviews</li>
            <li style={{ marginBottom: '0.5rem' }}>📝 Issue analysis and suggestions</li>
            <li style={{ marginBottom: '0.5rem' }}>⚙️ Per-project configuration</li>
          </ul>
        </div>
      </div>
    </div>
  );
}