import React, { useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useProject, useUpdateProjectConfig } from '../hooks/useProjects';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ProjectConfig } from '../types';

export function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading, error } = useProject(projectId!);
  const updateConfig = useUpdateProjectConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [config, setConfig] = useState<Partial<ProjectConfig>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize config when project loads
  React.useEffect(() => {
    if (project?.config) {
      setConfig(project.config);
    }
  }, [project?.config]);

  if (!projectId) {
    return <Navigate to="/" replace />;
  }

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

  if (error || !project) {
    return (
      <div style={{
        maxWidth: '800px',
        margin: '2rem auto',
        padding: '0 1rem',
        textAlign: 'center'
      }}>
        <h2 style={{ color: '#dc3545' }}>Project not found</h2>
        <p style={{ color: '#6c757d', marginBottom: '2rem' }}>
          The project you're looking for doesn't exist or Claude is not enabled for it.
        </p>
        <Link 
          to="/"
          style={{
            padding: '0.75rem 1.5rem',
            background: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px'
          }}
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!project.claudeEnabled) {
    return <Navigate to="/" replace />;
  }

  const handleConfigChange = (key: keyof ProjectConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateConfig.mutateAsync({
        projectId: projectId!,
        config: config as ProjectConfig
      });
      setHasChanges(false);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '2rem 1rem'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '2rem',
        gap: '1rem'
      }}>
        <Link 
          to="/"
          style={{
            color: '#007bff',
            textDecoration: 'none',
            fontSize: '1.2rem'
          }}
        >
          ← Back
        </Link>
        {project.avatar_url && (
          <img 
            src={project.avatar_url} 
            alt={project.name}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '4px'
            }}
          />
        )}
        <div>
          <h1 style={{ margin: 0 }}>{project.name}</h1>
          <p style={{ 
            margin: 0, 
            color: '#6c757d',
            fontSize: '0.9rem'
          }}>
            {project.path_with_namespace}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{
          background: 'white',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            Claude Configuration
          </h2>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              color: '#333'
            }}>
              Trigger Phrase
            </label>
            <input
              type="text"
              value={config.triggerPhrase || '@claude'}
              onChange={(e) => handleConfigChange('triggerPhrase', e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
              placeholder="@claude"
            />
            <small style={{ color: '#6c757d', fontSize: '0.85rem' }}>
              The phrase that triggers Claude to respond in comments
            </small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              color: '#333'
            }}>
              System Prompt
            </label>
            <textarea
              value={config.systemPrompt || ''}
              onChange={(e) => handleConfigChange('systemPrompt', e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
              placeholder="You are a helpful AI assistant working on GitLab projects..."
            />
            <small style={{ color: '#6c757d', fontSize: '0.85rem' }}>
              Custom instructions for Claude's behavior in this project
            </small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={config.autoReply ?? true}
                onChange={(e) => handleConfigChange('autoReply', e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontWeight: '500', color: '#333' }}>
                Auto-reply to mentions
              </span>
            </label>
            <small style={{ 
              color: '#6c757d', 
              fontSize: '0.85rem',
              marginLeft: '1.5rem',
              display: 'block',
              marginTop: '0.25rem'
            }}>
              Automatically respond when Claude is mentioned
            </small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={config.includeCodeContext ?? true}
                onChange={(e) => handleConfigChange('includeCodeContext', e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontWeight: '500', color: '#333' }}>
                Include code context
              </span>
            </label>
            <small style={{ 
              color: '#6c757d', 
              fontSize: '0.85rem',
              marginLeft: '1.5rem',
              display: 'block',
              marginTop: '0.25rem'
            }}>
              Include relevant code files and diffs in Claude's context
            </small>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              color: '#333'
            }}>
              Max Context Files
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={config.maxContextFiles || 10}
              onChange={(e) => handleConfigChange('maxContextFiles', parseInt(e.target.value))}
              style={{
                width: '120px',
                padding: '0.75rem',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                fontSize: '1rem'
              }}
            />
            <small style={{ 
              color: '#6c757d', 
              fontSize: '0.85rem',
              marginLeft: '1rem'
            }}>
              Maximum number of files to include for context
            </small>
          </div>
        </div>

        <div style={{
          background: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#495057' }}>
            Webhook Information
          </h3>
          <div style={{ 
            background: 'white',
            padding: '1rem',
            borderRadius: '4px',
            border: '1px solid #dee2e6',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            wordBreak: 'break-all'
          }}>
            {window.location.origin}/webhook/{projectId}
          </div>
          <small style={{ color: '#6c757d', fontSize: '0.85rem', marginTop: '0.5rem', display: 'block' }}>
            This webhook URL should be configured in your GitLab project settings
          </small>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end'
        }}>
          <Link
            to="/"
            style={{
              padding: '0.75rem 1.5rem',
              background: '#6c757d',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!hasChanges || isSubmitting}
            style={{
              padding: '0.75rem 1.5rem',
              background: hasChanges && !isSubmitting ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: hasChanges && !isSubmitting ? 'pointer' : 'not-allowed',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isSubmitting && <LoadingSpinner size={16} color="white" />}
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}