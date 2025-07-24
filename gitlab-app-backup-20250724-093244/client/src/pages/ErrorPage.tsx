import React from 'react';
import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom';

export function ErrorPage() {
  const error = useRouteError();
  console.error(error);

  let errorMessage: string;
  let errorStatus: string | number = '';

  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || error.data?.message || 'An error occurred';
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    errorMessage = 'Unknown error occurred';
  }

  const is404 = errorStatus === 404 || errorMessage.toLowerCase().includes('not found');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        padding: '3rem',
        maxWidth: '500px',
        width: '100%'
      }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '1rem'
        }}>
          {is404 ? '🔍' : '⚠️'}
        </div>
        
        <h1 style={{
          fontSize: '2rem',
          marginBottom: '1rem',
          color: '#333'
        }}>
          {is404 ? 'Page Not Found' : 'Oops! Something went wrong'}
        </h1>
        
        <p style={{
          color: '#6c757d',
          marginBottom: '2rem',
          lineHeight: '1.6'
        }}>
          {is404 
            ? "The page you're looking for doesn't exist or may have been moved."
            : `An unexpected error occurred: ${errorMessage}`
          }
        </p>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'center'
        }}>
          <Link
            to="/"
            style={{
              padding: '0.75rem 2rem',
              background: '#007bff',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#0056b3'}
            onMouseOut={(e) => e.currentTarget.style.background = '#007bff'}
          >
            🏠 Go Home
          </Link>
          
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '0.75rem 2rem',
              background: 'transparent',
              color: '#6c757d',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#f8f9fa';
              e.currentTarget.style.color = '#495057';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#6c757d';
            }}
          >
            ← Go Back
          </button>
        </div>

        {!is404 && (
          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            background: '#f8f9fa',
            borderRadius: '4px',
            textAlign: 'left'
          }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: '#495057' }}>
              Need help?
            </strong>
            <p style={{ 
              fontSize: '0.9rem', 
              color: '#6c757d', 
              margin: 0,
              lineHeight: '1.5'
            }}>
              If this error persists, please check your browser's developer console 
              for more details or contact your system administrator.
            </p>
          </div>
        )}
      </div>

      <div style={{
        marginTop: '2rem',
        color: '#adb5bd',
        fontSize: '0.85rem'
      }}>
        Claude GitLab App v1.0.0
      </div>
    </div>
  );
}