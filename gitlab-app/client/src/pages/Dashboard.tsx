import React, { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from '../components/ProjectCard';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function Dashboard() {
  const { data: projects, isLoading, error } = useProjects();
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh' 
      }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#dc3545'
      }}>
        <h2>Error loading projects</h2>
        <p>{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
        <button 
          onClick={() => window.location.reload()}
          style={{
            padding: '0.5rem 1rem',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '1rem'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const filteredProjects = projects?.filter(project => {
    if (filter === 'enabled') return project.claudeEnabled;
    if (filter === 'disabled') return !project.claudeEnabled;
    return true;
  }) || [];

  const enabledCount = projects?.filter(p => p.claudeEnabled).length || 0;
  const totalCount = projects?.length || 0;

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '2rem 1rem'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>Projects</h1>
          <p style={{ 
            margin: 0, 
            color: '#6c757d',
            fontSize: '0.9rem'
          }}>
            {enabledCount} of {totalCount} projects have Claude enabled
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '0.5rem',
          background: '#f8f9fa',
          padding: '0.25rem',
          borderRadius: '6px',
          border: '1px solid #dee2e6'
        }}>
          {(['all', 'enabled', 'disabled'] as const).map((filterOption) => (
            <button
              key={filterOption}
              onClick={() => setFilter(filterOption)}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: filter === filterOption ? '#007bff' : 'transparent',
                color: filter === filterOption ? 'white' : '#495057',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: filter === filterOption ? '500' : 'normal',
                transition: 'all 0.2s'
              }}
            >
              {filterOption === 'all' ? 'All' : 
               filterOption === 'enabled' ? 'Enabled' : 'Disabled'}
              {filterOption === 'all' && ` (${totalCount})`}
              {filterOption === 'enabled' && ` (${enabledCount})`}
              {filterOption === 'disabled' && ` (${totalCount - enabledCount})`}
            </button>
          ))}
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          background: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ marginBottom: '1rem', color: '#6c757d' }}>
            {filter === 'all' ? 'No projects found' :
             filter === 'enabled' ? 'No enabled projects' : 'No disabled projects'}
          </h3>
          <p style={{ color: '#6c757d', marginBottom: '1.5rem' }}>
            {filter === 'all' ? 
              'It looks like you don\'t have access to any GitLab projects, or they haven\'t been synchronized yet.' :
              filter === 'enabled' ? 
                'Enable Claude on some projects to see them here.' :
                'All your projects have Claude enabled!'}
          </p>
          {filter === 'all' && (
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Refresh Projects
            </button>
          )}
        </div>
      ) : (
        <div>
          {filteredProjects.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {projects && projects.length > 0 && (
        <div style={{
          marginTop: '3rem',
          padding: '2rem',
          background: '#e3f2fd',
          borderRadius: '8px',
          border: '1px solid #bbdefb'
        }}>
          <h3 style={{ marginBottom: '1rem', color: '#1976d2' }}>
            💡 How to use Claude
          </h3>
          <ul style={{ 
            margin: 0,
            paddingLeft: '1.5rem',
            lineHeight: '1.6',
            color: '#1565c0'
          }}>
            <li>Enable Claude on your projects using the toggle buttons above</li>
            <li>In GitLab, mention <code style={{ 
              background: 'rgba(0,0,0,0.1)', 
              padding: '0.2rem 0.4rem', 
              borderRadius: '3px',
              fontFamily: 'monospace'
            }}>@claude</code> in issue comments or merge request discussions</li>
            <li>Claude will respond with intelligent suggestions, analysis, and assistance</li>
            <li>Use the Settings button to configure Claude's behavior for each project</li>
          </ul>
        </div>
      )}
    </div>
  );
}