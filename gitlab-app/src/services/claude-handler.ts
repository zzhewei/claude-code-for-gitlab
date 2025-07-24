import axios from 'axios';
import { logger } from '../utils/logger.js';
import { getDataStore, loadConfig } from '../utils/config.js';

const config = loadConfig();

interface GitLabComment {
  id: number;
  body: string;
  author: {
    id: number;
    username: string;
    name: string;
  };
  created_at: string;
  system: boolean;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  web_url: string;
}

interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: string;
  web_url: string;
  source_branch: string;
  target_branch: string;
}

// Check if comment contains trigger phrase
function containsTrigger(text: string, triggerPhrase: string): boolean {
  return text.toLowerCase().includes(triggerPhrase.toLowerCase());
}

// Extract Claude command from comment
function extractCommand(text: string, triggerPhrase: string): string {
  const triggerIndex = text.toLowerCase().indexOf(triggerPhrase.toLowerCase());
  if (triggerIndex === -1) return '';
  
  return text.substring(triggerIndex + triggerPhrase.length).trim();
}

// Post a comment to GitLab
async function postComment(
  projectId: number,
  resourceType: 'issues' | 'merge_requests',
  resourceId: number,
  comment: string,
  accessToken: string
): Promise<void> {
  const url = `${config.gitlabUrl}/api/v4/projects/${projectId}/${resourceType}/${resourceId}/notes`;
  
  await axios.post(
    url,
    { body: comment },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// Get fresh access token
async function getAccessToken(userId: string): Promise<string> {
  const dataStore = getDataStore();
  const user = dataStore.getUser(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if token is expired
  if (user.tokenExpiresAt < Date.now() + 300000) { // 5 minutes buffer
    logger.info('Refreshing access token for user', { userId });
    
    const tokenResponse = await axios.post(`${config.gitlabUrl}/oauth/token`, {
      client_id: config.gitlab.appId,
      client_secret: config.gitlab.appSecret,
      refresh_token: user.refreshToken,
      grant_type: 'refresh_token',
    });
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Update stored tokens
    user.oauthToken = access_token;
    user.refreshToken = refresh_token;
    user.tokenExpiresAt = Date.now() + (expires_in * 1000);
    dataStore.saveUser(user);
    
    return access_token;
  }
  
  return user.oauthToken;
}

// Handle note events (comments)
async function handleNoteEvent(projectId: string, payload: any): Promise<void> {
  const note = payload.object_attributes;
  const project = payload.project;
  
  // Skip system notes
  if (note.system) return;
  
  const dataStore = getDataStore();
  const projectConfig = dataStore.getProject(projectId);
  
  if (!projectConfig || !projectConfig.enabled) {
    logger.info('Project not enabled for Claude', { projectId });
    return;
  }
  
  const triggerPhrase = projectConfig.settings.triggerPhrase || '@claude';
  
  // Check if comment contains trigger
  if (!containsTrigger(note.note, triggerPhrase)) {
    return;
  }
  
  logger.info('Claude triggered in comment', {
    projectId,
    noteId: note.id,
    author: note.author.username,
  });
  
  const command = extractCommand(note.note, triggerPhrase);
  const accessToken = await getAccessToken(projectConfig.userId);
  
  // Determine resource type and ID
  let resourceType: 'issues' | 'merge_requests';
  let resourceId: number;
  
  if (payload.issue) {
    resourceType = 'issues';
    resourceId = payload.issue.iid;
  } else if (payload.merge_request) {
    resourceType = 'merge_requests';
    resourceId = payload.merge_request.iid;
  } else {
    logger.warn('Unknown note context', { projectId });
    return;
  }
  
  try {
    // Post initial response
    await postComment(
      project.id,
      resourceType,
      resourceId,
      '🤖 Claude is thinking...',
      accessToken
    );
    
    // Prepare context for Claude
    const context = await gatherContext(
      project.id,
      resourceType,
      resourceId,
      accessToken
    );
    
    // Call Claude API
    const response = await callClaude(command, context, projectConfig.settings);
    
    // Post Claude's response
    await postComment(
      project.id,
      resourceType,
      resourceId,
      response,
      accessToken
    );
    
  } catch (error) {
    logger.error('Failed to process Claude request', { error, projectId });
    
    await postComment(
      project.id,
      resourceType,
      resourceId,
      '❌ Sorry, I encountered an error while processing your request.',
      accessToken
    );
  }
}

// Gather context for Claude
async function gatherContext(
  projectId: number,
  resourceType: 'issues' | 'merge_requests',
  resourceId: number,
  accessToken: string
): Promise<any> {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
  };
  
  // Get main resource
  const resourceUrl = `${config.gitlabUrl}/api/v4/projects/${projectId}/${resourceType}/${resourceId}`;
  const resourceResponse = await axios.get(resourceUrl, { headers });
  const resource = resourceResponse.data;
  
  // Get comments
  const notesUrl = `${config.gitlabUrl}/api/v4/projects/${projectId}/${resourceType}/${resourceId}/notes`;
  const notesResponse = await axios.get(notesUrl, { headers });
  const notes = notesResponse.data;
  
  // For merge requests, get additional context
  let changes = null;
  if (resourceType === 'merge_requests') {
    const changesUrl = `${config.gitlabUrl}/api/v4/projects/${projectId}/merge_requests/${resourceId}/diffs`;
    const changesResponse = await axios.get(changesUrl, { headers });
    changes = changesResponse.data;
  }
  
  return {
    type: resourceType,
    resource,
    notes,
    changes,
  };
}

// Call Claude API
async function callClaude(command: string, context: any, settings: any): Promise<string> {
  const claudeApiKey = config.claude.apiKey;
  if (!claudeApiKey) {
    throw new Error('Claude API key not configured');
  }
  
  // Format the prompt
  let prompt = `You are Claude, an AI assistant helping with GitLab ${context.type === 'issues' ? 'issue' : 'merge request'} #${context.resource.iid}.

Title: ${context.resource.title}
Description: ${context.resource.description || 'No description'}
State: ${context.resource.state}
URL: ${context.resource.web_url}

`;
  
  if (context.type === 'merge_requests') {
    prompt += `Source Branch: ${context.resource.source_branch}
Target Branch: ${context.resource.target_branch}

`;
  }
  
  // Add recent comments
  const recentNotes = context.notes
    .filter((n: any) => !n.system)
    .slice(-5)
    .map((n: any) => `${n.author.username}: ${n.body}`)
    .join('\n\n');
  
  if (recentNotes) {
    prompt += `Recent Comments:\n${recentNotes}\n\n`;
  }
  
  prompt += `User Command: ${command}

Please provide a helpful response. Keep your response concise and relevant to the context.`;
  
  // Call Claude API
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: settings.model || config.claude.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 1000,
    },
    {
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );
  
  return response.data.content[0].text;
}

// Handle issue events
async function handleIssueEvent(projectId: string, payload: any): Promise<void> {
  // Could implement automatic actions for new issues
  logger.info('Issue event received', {
    projectId,
    action: payload.object_attributes.action,
    issueId: payload.object_attributes.iid,
  });
}

// Handle merge request events
async function handleMergeRequestEvent(projectId: string, payload: any): Promise<void> {
  // Could implement automatic code review on new MRs
  logger.info('Merge request event received', {
    projectId,
    action: payload.object_attributes.action,
    mrId: payload.object_attributes.iid,
  });
}

// Main event handler
export async function handleGitLabEvent(
  projectId: string,
  eventType: string,
  payload: any
): Promise<void> {
  logger.info('Processing GitLab event', { projectId, eventType });
  
  try {
    switch (eventType) {
      case 'Note Hook':
        await handleNoteEvent(projectId, payload);
        break;
      case 'Issue Hook':
        await handleIssueEvent(projectId, payload);
        break;
      case 'Merge Request Hook':
        await handleMergeRequestEvent(projectId, payload);
        break;
      default:
        logger.warn('Unhandled event type', { projectId, eventType });
    }
  } catch (error) {
    logger.error('Failed to handle GitLab event', {
      error,
      projectId,
      eventType,
    });
    throw error;
  }
}