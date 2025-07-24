import { Router, Request, Response } from 'express';

import { getDataStore } from '../utils/config.js';
import { handleGitLabEvent } from '../services/claude-handler.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Verify GitLab webhook token
function verifyWebhookToken(req: Request, projectId: string): boolean {
  const token = req.headers['x-gitlab-token'] as string;
  if (!token) return false;
  
  const dataStore = getDataStore();
  const webhook = dataStore.getWebhookByProjectId(`project_${projectId}`);
  
  if (!webhook) return false;
  
  return webhook.token === token;
}

// Webhook endpoint for each project
router.post('/:projectId', async (req: Request, res: Response): Promise<void> => {
  const projectId = req.params.projectId;
  
  // Verify webhook token
  if (!verifyWebhookToken(req, projectId)) {
    logger.warn(`Invalid webhook token for project ${projectId}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const eventType = req.headers['x-gitlab-event'] as string;
  const payload = req.body;
  
  logger.info(`Received ${eventType} webhook for project ${projectId}`);
  
  // Process webhook asynchronously
  handleGitLabEvent(projectId, eventType, payload)
    .catch(error => {
      logger.error(`Failed to handle webhook event:`, error);
    });
  
  // Respond immediately to GitLab
  res.status(200).json({ received: true });
});

export default router;