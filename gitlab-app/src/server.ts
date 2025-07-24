import express, { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import dashboardRoutes from './routes/dashboard.js';
import webhookRoutes from './routes/webhook.js';
import { logger } from './utils/logger.js';
import { AppConfig, loadConfig } from './utils/config.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Load configuration
const config: AppConfig = loadConfig();

// Extend session data type
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      username: string;
      email: string;
      avatar_url?: string;
      gitlab_user_id: number;
    };
    oauth?: {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
  }
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || true,
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', join(__dirname, '../views'));

// Static files
app.use('/static', express.static(join(__dirname, '../public')));

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/webhook', webhookRoutes);

// Home page
app.get('/', (req: Request, res: Response) => {
  res.render('index', { 
    user: req.session.user,
    appUrl: config.appUrl,
    gitlabUrl: config.gitlabUrl,
  });
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    version: '1.0.0',
    uptime: process.uptime(),
    config: {
      gitlabConfigured: !!(config.gitlab.appId && config.gitlab.appSecret),
      claudeConfigured: !!(config.claude.apiKey || config.claude.oauthToken),
    },
  });
});

// Error handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Error:', err);
  res.status(500).render('error', { error: err.message });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Claude GitLab App running on port ${PORT}`);
  logger.info(`App URL: ${config.appUrl}`);
  
  if (!config.gitlab.appId || !config.gitlab.appSecret) {
    logger.warn('GitLab OAuth credentials not configured!');
    logger.warn('Please set GITLAB_APP_ID and GITLAB_APP_SECRET environment variables');
  }
  
  if (!config.claude.apiKey && !config.claude.oauthToken) {
    logger.warn('Claude credentials not configured!');
    logger.warn('Please set either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN');
  }
});