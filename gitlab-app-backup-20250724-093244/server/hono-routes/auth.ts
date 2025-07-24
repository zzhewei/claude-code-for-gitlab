import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import axios from 'axios'
import * as crypto from 'crypto'

import { loadConfig, getDataStore, UserData } from '../utils/config'
import { logger } from '../utils/logger'
import { SessionData } from '../hono-server'

const auth = new Hono<{ Variables: { session: SessionData } }>()
const config = loadConfig()

// Generate random state for OAuth
function generateState(): string {
  return crypto.randomBytes(32).toString('hex')
}

// OAuth login route
auth.get('/gitlab', (c) => {
  const session = c.get('session')
  const state = generateState()
  session.oauthState = state
  
  const params = new URLSearchParams({
    client_id: config.gitlab.appId,
    redirect_uri: config.gitlab.redirectUri,
    response_type: 'code',
    state,
    scope: config.gitlab.scope,
  })
  
  const authUrl = `${config.gitlabUrl}/oauth/authorize?${params}`
  return c.redirect(authUrl, 302)
})

// OAuth callback validation schema
const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
})

// OAuth callback
auth.get('/callback', zValidator('query', callbackSchema), async (c) => {
  const { code, state } = c.req.valid('query')
  const session = c.get('session')
  
  // Verify state
  if (state !== session.oauthState) {
    logger.error('Invalid OAuth state')
    return c.redirect('/app/error?message=Invalid OAuth state', 302)
  }
  
  delete session.oauthState
  
  try {
    // Exchange code for token
    const tokenResponse = await axios.post(`${config.gitlabUrl}/oauth/token`, {
      client_id: config.gitlab.appId,
      client_secret: config.gitlab.appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.gitlab.redirectUri,
    })
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data
    
    // Get user info
    const userResponse = await axios.get(`${config.gitlabUrl}/api/v4/user`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    })
    
    const gitlabUser = userResponse.data
    
    // Save user data
    const dataStore = getDataStore()
    const userId = `user_${gitlabUser.id}`
    
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
    }
    
    dataStore.saveUser(userData)
    
    // Save session
    session.user = {
      id: userId,
      username: gitlabUser.username,
      email: gitlabUser.email,
      avatar_url: gitlabUser.avatar_url,
      gitlab_user_id: gitlabUser.id,
    }
    
    session.oauth = {
      access_token,
      refresh_token,
      expires_at: userData.tokenExpiresAt,
    }
    
    logger.info(`User ${gitlabUser.username} logged in successfully`)
    return c.redirect('/app', 302)
    
  } catch (error) {
    logger.error('OAuth callback error:', error)
    return c.redirect('/app/error?message=Failed to authenticate with GitLab', 302)
  }
})

// Logout route
auth.get('/logout', (c) => {
  const session = c.get('session')
  const username = session.user?.username
  
  // Clear session data
  session.user = undefined
  session.oauth = undefined
  
  logger.info(`User ${username} logged out`)
  return c.redirect('/app/login', 302)
})

// Token refresh endpoint (for API calls)
auth.post('/refresh', async (c) => {
  const session = c.get('session')
  
  if (!session.user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }
  
  const dataStore = getDataStore()
  const user = dataStore.getUser(session.user.id)
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }
  
  try {
    const tokenResponse = await axios.post(`${config.gitlabUrl}/oauth/token`, {
      client_id: config.gitlab.appId,
      client_secret: config.gitlab.appSecret,
      refresh_token: user.refreshToken,
      grant_type: 'refresh_token',
    })
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data
    
    // Update stored tokens
    user.oauthToken = access_token
    user.refreshToken = refresh_token
    user.tokenExpiresAt = Date.now() + (expires_in * 1000)
    dataStore.saveUser(user)
    
    // Update session
    session.oauth = {
      access_token,
      refresh_token,
      expires_at: user.tokenExpiresAt,
    }
    
    return c.json({ success: true, expires_at: user.tokenExpiresAt })
    
  } catch (error) {
    logger.error('Token refresh error:', error)
    return c.json({ error: 'Failed to refresh token' }, 500)
  }
})

// Get current user endpoint for React app
auth.get('/me', (c) => {
  const session = c.get('session')
  
  if (!session.user) {
    return c.json({ error: 'Not authenticated' }, 401)
  }
  
  return c.json({
    user: session.user,
    authenticated: true,
  })
})

export default auth