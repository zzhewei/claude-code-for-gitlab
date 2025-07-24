import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Project } from '../types';
import { useEnableProject, useDisableProject } from '../hooks/useProjects';
import { LoadingSpinner } from './LoadingSpinner';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [isToggling, setIsToggling] = useState(false);
  const enableProject = useEnableProject();
  const disableProject = useDisableProject();

  const handleToggle = async () => {
    if (isToggling) return;

    setIsToggling(true);
    try {
      if (project.claudeEnabled) {
        if (window.confirm('Are you sure you want to disable Claude for this project? This will remove the webhook.')) {
          await disableProject.mutateAsync(project.id);
        }
      } else {
        await enableProject.mutateAsync(project.id);
      }
    } catch (error) {
      console.error('Failed to toggle project:', error);
      alert('Failed to update project. Please try again.');
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1rem',
      border: '1px solid #ddd',
      borderRadius: '4px',
      marginBottom: '1rem',
      background: 'white'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
        {project.avatar_url && (
          <img 
            src={project.avatar_url} 
            alt={project.name}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '4px'
            }}
          />
        )}
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
            {project.name}
          </strong>
          <div style={{ color: '#6c757d', fontSize: '0.9rem' }}>
            {project.path_with_namespace}
          </div>
          {project.description && (
            <div style={{ 
              color: '#6c757d', 
              fontSize: '0.85rem',
              marginTop: '0.25rem',
              maxWidth: '400px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {project.description}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {project.claudeEnabled && (
          <span style={{ 
            color: '#28a745', 
            fontWeight: '500',
            marginRight: '0.5rem'
          }}>
            ✓ Enabled
          </span>
        )}
        
        {project.claudeEnabled && (
          <Link
            to={`/project/${project.id}`}
            style={{
              padding: '0.5rem 1rem',
              background: '#6c757d',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '0.9rem',
              transition: 'background 0.2s'
            }}
          >
            Settings
          </Link>
        )}

        <button
          onClick={handleToggle}
          disabled={isToggling}
          style={{
            padding: '0.5rem 1rem',
            background: project.claudeEnabled ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isToggling ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            transition: 'background 0.2s',
            opacity: isToggling ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {isToggling && <LoadingSpinner size={16} color="white" />}
          {project.claudeEnabled ? 'Disable' : 'Enable Claude'}
        </button>

        <a
          href={project.web_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '0.5rem 1rem',
            background: '#6c757d',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '0.9rem',
            transition: 'background 0.2s'
          }}
        >
          Open
        </a>
      </div>
    </div>
  );
}