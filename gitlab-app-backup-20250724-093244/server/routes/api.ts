import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';

import { loadConfig, getDataStore, ProjectConfig, WebhookSubscription } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const router = Router();
const config = loadConfig();

// Middleware to ensure authentication
function requireAuth(req: Request, res: Response, next: Function): void {
  if (!req.session.user || !req.session.oauth) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}

// Get user's accessible projects
router.get('/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${config.gitlabUrl}/api/v4/projects`, {
      headers: {
        'Authorization': `Bearer ${req.session.oauth!.access_token}`,
      },
      params: {
        membership: true,
        min_access_level: 30, // Developer access or higher
        per_page: 100,
      },
    });
    
    const dataStore = getDataStore();
    const userProjects = dataStore.getUserProjects(req.session.user!.id);
    const enabledProjectIds = new Set(userProjects.filter(p => p.enabled).map(p => p.gitlabProjectId));
    
    const projects = response.data.map((project: any) => ({
      id: project.id,
      name: project.name,
      path_with_namespace: project.path_with_namespace,
      description: project.description,
      avatar_url: project.avatar_url,
      web_url: project.web_url,
      claudeEnabled: enabledProjectIds.has(project.id),
    }));
    
    res.json(projects);
  } catch (error) {
    logger.error('Failed to fetch projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Enable Claude for a project
router.post('/projects/:projectId/enable', requireAuth, async (req: Request, res: Response) => {
  const gitlabProjectId = parseInt(req.params.projectId);
  
  try {
    // Verify user has access to the project
    const projectResponse = await axios.get(`${config.gitlabUrl}/api/v4/projects/${gitlabProjectId}`, {
      headers: {
        'Authorization': `Bearer ${req.session.oauth!.access_token}`,
      },
    });
    
    const gitlabProject = projectResponse.data;
    
    // Create webhook
    const webhookToken = crypto.randomBytes(32).toString('hex');
    const webhookUrl = `${config.appUrl}/webhook/${gitlabProjectId}`;
    
    const webhookResponse = await axios.post(
      `${config.gitlabUrl}/api/v4/projects/${gitlabProjectId}/hooks`,
      {
        url: webhookUrl,
        token: webhookToken,
        push_events: false,
        issues_events: true,
        merge_requests_events: true,
        wiki_page_events: false,
        pipeline_events: false,
        job_events: false,
        note_events: true,
        enable_ssl_verification: true,
      },
      {
        headers: {
          'Authorization': `Bearer ${req.session.oauth!.access_token}`,
        },
      }
    );
    
    const webhook = webhookResponse.data;
    
    // Save project configuration
    const dataStore = getDataStore();
    const projectId = `project_${gitlabProjectId}`;
    
    const projectConfig: ProjectConfig = {
      id: projectId,
      gitlabProjectId,
      name: gitlabProject.name,
      path: gitlabProject.path_with_namespace,
      userId: req.session.user!.id,
      enabled: true,
      settings: {
        triggerPhrase: '@claude',
        model: config.claude.model,
        maxTurns: 5,
      },
      webhookId: `webhook_${webhook.id}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    dataStore.saveProject(projectConfig);
    
    // Save webhook info
    const webhookSub: WebhookSubscription = {
      id: `webhook_${webhook.id}`,
      projectId,
      gitlabWebhookId: webhook.id,
      url: webhookUrl,
      token: webhookToken,
      events: ['issues_events', 'merge_requests_events', 'note_events'],
      createdAt: new Date().toISOString(),
    };
    
    dataStore.saveWebhook(webhookSub);
    
    logger.info(`Enabled Claude for project ${gitlabProject.path_with_namespace}`);
    res.json({ success: true, project: projectConfig });
    
  } catch (error) {
    logger.error('Failed to enable project:', error);
    res.status(500).json({ error: 'Failed to enable project' });
  }
});

// Disable Claude for a project
router.post('/projects/:projectId/disable', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const gitlabProjectId = parseInt(req.params.projectId);
  
  try {
    const dataStore = getDataStore();
    const projectId = `project_${gitlabProjectId}`;
    const project = dataStore.getProject(projectId);
    
    if (!project || project.userId !== req.session.user!.id) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Delete webhook from GitLab
    if (project.webhookId) {
      const webhook = dataStore.getWebhook(project.webhookId);
      if (webhook) {
        try {
          await axios.delete(
            `${config.gitlabUrl}/api/v4/projects/${gitlabProjectId}/hooks/${webhook.gitlabWebhookId}`,
            {
              headers: {
                'Authorization': `Bearer ${req.session.oauth!.access_token}`,
              },
            }
          );
        } catch (error) {
          logger.warn(`Failed to delete webhook from GitLab:`, error);
        }
        
        dataStore.deleteWebhook(webhook.id);
      }
    }
    
    // Delete project configuration
    dataStore.deleteProject(projectId);
    
    logger.info(`Disabled Claude for project ${project.path}`);
    res.json({ success: true });
    
  } catch (error) {
    logger.error('Failed to disable project:', error);
    res.status(500).json({ error: 'Failed to disable project' });
  }
});

// Update project settings
router.put('/projects/:projectId/settings', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const gitlabProjectId = parseInt(req.params.projectId);
  const { triggerPhrase, model, maxTurns, allowedTools } = req.body;
  
  try {
    const dataStore = getDataStore();
    const projectId = `project_${gitlabProjectId}`;
    const project = dataStore.getProject(projectId);
    
    if (!project || project.userId !== req.session.user!.id) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Update settings
    if (triggerPhrase) project.settings.triggerPhrase = triggerPhrase;
    if (model) project.settings.model = model;
    if (maxTurns !== undefined) project.settings.maxTurns = maxTurns;
    if (allowedTools) project.settings.allowedTools = allowedTools;
    
    dataStore.saveProject(project);
    
    logger.info(`Updated settings for project ${project.path}`);
    res.json({ success: true, settings: project.settings });
    
  } catch (error) {
    logger.error('Failed to update project settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;