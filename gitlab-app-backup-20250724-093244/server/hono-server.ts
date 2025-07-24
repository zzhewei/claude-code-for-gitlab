import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { logger as honoLogger } from 'hono/logger'
import { sessionMiddleware, MemoryStore, type SessionData as SessionDataType } from 'hono-sessions'  
import * as dotenv from 'dotenv'
import { dirname, join } from 'path'

import { AppConfig, loadConfig } from './utils/config'
import { logger } from './utils/logger'
import authRoutes from './hono-routes/auth'
import apiRoutes from './hono-routes/api'
import webhookRoutes from './hono-routes/webhook'

dotenv.config()

// Load configuration
const config: AppConfig = loadConfig()
const PORT = Number(process.env.PORT) || 3000

// Extend session data types for hono-sessions
export interface SessionData extends SessionDataType {
  user?: {
    id: string
    username: string
    email: string
    avatar_url?: string
    gitlab_user_id: number
  }
  oauth?: {
    access_token: string
    refresh_token: string
    expires_at: number
  }
  oauthState?: string
}

declare module 'hono-sessions' {
  interface SessionData {
    user?: {
      id: string
      username: string
      email: string
      avatar_url?: string
      gitlab_user_id: number
    }
    oauth?: {
      access_token: string
      refresh_token: string
      expires_at: number
    }
    oauthState?: string
  }
}

// Create Hono app with session support
type Variables = {
  session: SessionData
}

const app = new Hono<{ Variables: Variables }>()

// Middleware
app.use('*', honoLogger())

// Session middleware - must be before routes that need sessions
const store = new MemoryStore()
app.use('*', sessionMiddleware({
  store,
  sessionCookieOptions: {
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}))

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
    imgSrc: ["'self'", "data:", "https:"],
  },
}))

app.use('*', cors({
  origin: process.env.NODE_ENV === 'development' 
    ? ['http://localhost:5173', 'http://localhost:3000']
    : (process.env.ALLOWED_ORIGINS?.split(',') || [config.appUrl]),
  credentials: true,
}))

// Health check route
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy',
    version: '1.0.0',
    framework: 'hono',
    runtime: 'bun',
    uptime: process.uptime(),
    config: {
      gitlabConfigured: !!(config.gitlab.appId && config.gitlab.appSecret),
      claudeConfigured: !!(config.claude.apiKey || config.claude.oauthToken),
    },
  })
})

// Mount routes
app.route('/auth', authRoutes)
app.route('/api', apiRoutes)
app.route('/webhook', webhookRoutes)

// Redirect root to React app
app.get('/', (c) => {
  return c.redirect('/app', 302)
})

// Serve React app (SPA catch-all route)
app.get('/app/*', (c) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, serve the built React app
    const path = join(process.cwd(), 'client/dist/index.html')
    return c.html(Bun.file(path).text())
  } else {
    // In development, redirect to Vite dev server
    const path = c.req.path
    return c.redirect(`http://localhost:5173${path}`, 302)
  }
})

// Error handling
app.onError((err, c) => {
  logger.error('Error:', err)
  
  // For API routes, return JSON error
  const path = c.req.path
  if (path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/webhook/')) {
    return c.json({ error: err.message }, 500)
  }
  
  // For app routes, redirect to React app which will handle error display
  return c.redirect('/app/error', 302)
})

// Start server with Bun
logger.info(`Hono GitLab App running on port ${PORT}`)
logger.info(`App URL: ${config.appUrl}`)

if (!config.gitlab.appId || !config.gitlab.appSecret) {
  logger.warn('GitLab OAuth credentials not configured!')
  logger.warn('Please set GITLAB_APP_ID and GITLAB_APP_SECRET environment variables')
}

if (!config.claude.apiKey && !config.claude.oauthToken) {
  logger.warn('Claude credentials not configured!')
  logger.warn('Please set either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN')
}

export default {
  port: PORT,
  fetch: app.fetch,
}