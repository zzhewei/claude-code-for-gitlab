import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

import { getDataStore } from '../utils/config'
import { handleGitLabEvent } from '../services/claude-handler'
import { logger } from '../utils/logger'

const webhook = new Hono()

// Verify GitLab webhook token
function verifyWebhookToken(token: string | undefined, projectId: string): boolean {
  if (!token) return false
  
  const dataStore = getDataStore()
  const webhookData = dataStore.getWebhookByProjectId(`project_${projectId}`)
  
  if (!webhookData) return false
  
  return webhookData.token === token
}

// Webhook validation schema
const webhookParamsSchema = z.object({
  projectId: z.string(),
})

// Webhook endpoint for each project
webhook.post('/:projectId', zValidator('param', webhookParamsSchema), async (c) => {
  const { projectId } = c.req.valid('param')
  
  // Get headers
  const token = c.req.header('x-gitlab-token')
  const eventType = c.req.header('x-gitlab-event')
  
  // Verify webhook token
  if (!verifyWebhookToken(token, projectId)) {
    logger.warn(`Invalid webhook token for project ${projectId}`)
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  if (!eventType) {
    logger.warn(`Missing event type for project ${projectId}`)
    return c.json({ error: 'Missing event type' }, 400)
  }
  
  try {
    const payload = await c.req.json()
    
    logger.info(`Received ${eventType} webhook for project ${projectId}`)
    
    // Process webhook asynchronously
    handleGitLabEvent(projectId, eventType, payload)
      .catch(error => {
        logger.error(`Failed to handle webhook event:`, error)
      })
    
    // Respond immediately to GitLab
    return c.json({ received: true })
    
  } catch (error) {
    logger.error(`Error parsing webhook payload for project ${projectId}:`, error)
    return c.json({ error: 'Invalid payload' }, 400)
  }
})

export default webhook