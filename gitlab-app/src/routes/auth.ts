import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { loadConfig, getDataStore, UserData } from '../utils/config.js';

const router = Router();
const config = loadConfig();

// Generate random state for OAuth
function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

// OAuth login route
router.get('/gitlab', (req: Request, res: Response) => {
  const state = generateState();
  req.session.oauthState = state;
  
  const params = new URLSearchParams({
    client_id: config.gitlab.appId,
    redirect_uri: config.gitlab.redirectUri,
    response_type: 'code',
    state,
    scope: config.gitlab.scope,
  });
  
  const authUrl = `${config.gitlabUrl}/oauth/authorize?${params}`;
  res.redirect(authUrl);
});

// OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;
  
  // Verify state
  if (state !== req.session.oauthState) {
    logger.error('Invalid OAuth state');
    return res.status(400).render('error', { error: 'Invalid OAuth state' });
  }
  
  delete req.session.oauthState;
  
  if (!code || typeof code !== 'string') {
    logger.error('No authorization code received');
    return res.status(400).render('error', { error: 'No authorization code received' });
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await axios.post(`${config.gitlabUrl}/oauth/token`, {
      client_id: config.gitlab.appId,
      client_secret: config.gitlab.appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.gitlab.redirectUri,
    });
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Get user info
    const userResponse = await axios.get(`${config.gitlabUrl}/api/v4/user`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });
    
    const gitlabUser = userResponse.data;
    
    // Save user data
    const dataStore = getDataStore();
    const userId = `user_${gitlabUser.id}`;
    
    const userData: UserData = {
      id: userId,
      gitlabUserId: gitlabUser.id,
      username: gitlabUser.username,
      email: gitlabUser.email,
      avatarUrl: gitlabUser.avatar_url,
      oauthToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt: Date.now() + (expires_in * 1000),
      authorizedProjects: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    dataStore.saveUser(userData);
    
    // Save session
    req.session.user = {
      id: userId,
      username: gitlabUser.username,
      email: gitlabUser.email,
      avatar_url: gitlabUser.avatar_url,
      gitlab_user_id: gitlabUser.id,
    };
    
    req.session.oauth = {
      access_token,
      refresh_token,
      expires_at: userData.tokenExpiresAt,
    };
    
    logger.info(`User ${gitlabUser.username} logged in successfully`);
    res.redirect('/dashboard');
    
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).render('error', { error: 'Failed to authenticate with GitLab' });
  }
});

// Logout route
router.get('/logout', (req: Request, res: Response) => {
  const username = req.session.user?.username;
  req.session.destroy((err) => {
    if (err) {
      logger.error('Session destroy error:', err);
    } else {
      logger.info(`User ${username} logged out`);
    }
    res.redirect('/');
  });
});

// Token refresh endpoint (for API calls)
router.post('/refresh', async (req: Request, res: Response) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const dataStore = getDataStore();
  const user = dataStore.getUser(req.session.user.id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  try {
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
    
    // Update session
    req.session.oauth = {
      access_token,
      refresh_token,
      expires_at: user.tokenExpiresAt,
    };
    
    res.json({ success: true, expires_at: user.tokenExpiresAt });
    
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

export default router;