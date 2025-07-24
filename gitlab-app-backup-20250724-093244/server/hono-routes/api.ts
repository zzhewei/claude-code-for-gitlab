import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import axios from 'axios'
import * as crypto from 'crypto'

import { loadConfig, getDataStore, ProjectConfig, WebhookSubscription } from '../utils/config'
import { logger } from '../utils/logger'
import { SessionData } from '../hono-server'

const api = new Hono<{ Variables: { session: SessionData } }>()
const config = loadConfig()

// Middleware to ensure authentication
const requireAuth = async (c: any, next: any) => {
  const session = c.get('session')
  
  if (!session.user || !session.oauth) {
    return c.json({ error: 'Not authenticated' }, 401)
  }
  
  await next()
}

// Get user's accessible projects
api.get('/projects', requireAuth, async (c) => {
  const session = c.get('session')
  
  try {
    const response = await axios.get(`${config.gitlabUrl}/api/v4/projects`, {
      headers: {
        'Authorization': `Bearer ${session.oauth!.access_token}`,
      },
      params: {
        membership: true,
        min_access_level: 30, // Developer access or higher
        per_page: 100,
      },
    })
    
    const dataStore = getDataStore()
    const userProjects = dataStore.getUserProjects(session.user!.id)
    const enabledProjectIds = new Set(userProjects.filter(p => p.enabled).map(p => p.gitlabProjectId))
    
    const projects = response.data.map((project: any) => ({
      id: project.id,
      name: project.name,
      path_with_namespace: project.path_with_namespace,
      description: project.description,
      avatar_url: project.avatar_url,
      web_url: project.web_url,
      claudeEnabled: enabledProjectIds.has(project.id),
    }))
    
    return c.json(projects)
  } catch (error) {
    logger.error('Failed to fetch projects:', error)
    return c.json({ error: 'Failed to fetch projects' }, 500)
  }
})

// Enable Claude for a project - validation schema
const enableProjectSchema = z.object({
  projectId: z.string().transform((val) => parseInt(val, 10)),
})

// Enable Claude for a project
api.post('/projects/:projectId/enable', zValidator('param', enableProjectSchema), requireAuth, async (c) => {
  const { projectId: gitlabProjectId } = c.req.valid('param')
  const session = c.get('session')
  
  try {
    // Verify user has access to the project
    const projectResponse = await axios.get(`${config.gitlabUrl}/api/v4/projects/${gitlabProjectId}`, {
      headers: {
        'Authorization': `Bearer ${session.oauth!.access_token}`,
      },
    })
    
    const gitlabProject = projectResponse.data
    
    // Create webhook
    const webhookToken = crypto.randomBytes(32).toString('hex')
    const webhookUrl = `${config.appUrl}/webhook/${gitlabProjectId}`
    
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
          'Authorization': `Bearer ${session.oauth!.access_token}`,
        },
      }
    )
    
    const webhook = webhookResponse.data
    
    // Save project configuration
    const dataStore = getDataStore()
    const projectId = `project_${gitlabProjectId}`
    
    const projectConfig: ProjectConfig = {
      id: projectId,
      gitlabProjectId,
      name: gitlabProject.name,
      path: gitlabProject.path_with_namespace,
      userId: session.user!.id,
      enabled: true,
      settings: {
        triggerPhrase: '@claude',
        model: config.claude.model,
        maxTurns: 5,
      },
      webhookId: `webhook_${webhook.id}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    dataStore.saveProject(projectConfig)
    
    // Save webhook info
    const webhookSub: WebhookSubscription = {
      id: `webhook_${webhook.id}`,
      projectId,
      gitlabWebhookId: webhook.id,
      url: webhookUrl,
      token: webhookToken,
      events: ['issues_events', 'merge_requests_events', 'note_events'],
      createdAt: new Date().toISOString(),
    }
    
    dataStore.saveWebhook(webhookSub)
    
    logger.info(`Enabled Claude for project ${gitlabProject.path_with_namespace}`)
    return c.json({ success: true, project: projectConfig })
    
  } catch (error) {
    logger.error('Failed to enable project:', error)
    return c.json({ error: 'Failed to enable project' }, 500)
  }
})

// Disable Claude for a project
api.post('/projects/:projectId/disable', zValidator('param', enableProjectSchema), requireAuth, async (c) => {
  const { projectId: gitlabProjectId } = c.req.valid('param')
  const session = c.get('session')
  
  try {
    const dataStore = getDataStore()
    const projectId = `project_${gitlabProjectId}`
    const project = dataStore.getProject(projectId)
    
    if (!project || project.userId !== session.user!.id) {
      return c.json({ error: 'Project not found' }, 404)
    }
    
    // Delete webhook from GitLab
    if (project.webhookId) {
      const webhook = dataStore.getWebhook(project.webhookId)
      if (webhook) {
        try {
          await axios.delete(
            `${config.gitlabUrl}/api/v4/projects/${gitlabProjectId}/hooks/${webhook.gitlabWebhookId}`,
            {
              headers: {
                'Authorization': `Bearer ${session.oauth!.access_token}`,
              },
            }
          )
        } catch (error) {
          logger.warn(`Failed to delete webhook from GitLab:`, error)
        }
        
        dataStore.deleteWebhook(webhook.id)
      }
    }
    
    // Delete project configuration
    dataStore.deleteProject(projectId)
    
    logger.info(`Disabled Claude for project ${project.path}`)
    return c.json({ success: true })
    
  } catch (error) {
    logger.error('Failed to disable project:', error)
    return c.json({ error: 'Failed to disable project' }, 500)
  }
})

// Update project settings - validation schema
const updateSettingsSchema = z.object({
  triggerPhrase: z.string().optional(),
  model: z.string().optional(),
  maxTurns: z.number().optional(),
  allowedTools: z.array(z.string()).optional(),
})

// Update project settings
api.put('/projects/:projectId/settings', 
  zValidator('param', enableProjectSchema),
  zValidator('json', updateSettingsSchema),
  requireAuth, 
  async (c) => {
    const { projectId: gitlabProjectId } = c.req.valid('param')
    const { triggerPhrase, model, maxTurns, allowedTools } = c.req.valid('json')
    const session = c.get('session')
    
    try {
      const dataStore = getDataStore()
      const projectId = `project_${gitlabProjectId}`
      const project = dataStore.getProject(projectId)
      
      if (!project || project.userId !== session.user!.id) {
        return c.json({ error: 'Project not found' }, 404)
      }
      
      // Update settings
      if (triggerPhrase) project.settings.triggerPhrase = triggerPhrase
      if (model) project.settings.model = model
      if (maxTurns !== undefined) project.settings.maxTurns = maxTurns
      if (allowedTools) project.settings.allowedTools = allowedTools
      
      dataStore.saveProject(project)
      
      logger.info(`Updated settings for project ${project.path}`)
      return c.json({ success: true, settings: project.settings })
      
    } catch (error) {
      logger.error('Failed to update project settings:', error)
      return c.json({ error: 'Failed to update settings' }, 500)
    }
  }
)

export default api