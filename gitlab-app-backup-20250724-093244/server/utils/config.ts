import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import CryptoJS from 'crypto-js';

export interface AppConfig {
  appUrl: string;
  gitlabUrl: string;
  gitlab: {
    appId: string;
    appSecret: string;
    redirectUri: string;
    scope: string;
  };
  claude: {
    apiKey?: string;
    oauthToken?: string;
    model: string;
  };
  storage: {
    dataPath: string;
    encryptionKey: string;
  };
}

export interface StoredData {
  users: Record<string, UserData>;
  projects: Record<string, ProjectConfig>;
  webhooks: Record<string, WebhookSubscription>;
}

export interface UserData {
  id: string;
  gitlabUserId: number;
  username: string;
  email: string;
  avatarUrl?: string;
  oauthToken: string; // encrypted
  refreshToken: string; // encrypted
  tokenExpiresAt: number;
  authorizedProjects: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConfig {
  id: string;
  gitlabProjectId: number;
  name: string;
  path: string;
  userId: string;
  enabled: boolean;
  settings: {
    triggerPhrase: string;
    model?: string;
    maxTurns?: number;
    allowedTools?: string[];
  };
  webhookId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookSubscription {
  id: string;
  projectId: string;
  gitlabWebhookId: number;
  url: string;
  token: string;
  events: string[];
  createdAt: string;
}

class DataStore {
  private dataPath: string;
  private encryptionKey: string;
  private data: StoredData;

  constructor(dataPath: string, encryptionKey: string) {
    this.dataPath = dataPath;
    this.encryptionKey = encryptionKey;
    
    // Ensure data directory exists
    const dir = join(dataPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    this.data = this.load();
  }

  private encrypt(text: string): string {
    return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
  }

  private decrypt(ciphertext: string): string {
    const bytes = CryptoJS.AES.decrypt(ciphertext, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  private load(): StoredData {
    if (existsSync(this.dataPath)) {
      try {
        const content = readFileSync(this.dataPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.error('Failed to load data file:', error);
      }
    }
    
    // Initialize with empty data
    return {
      users: {},
      projects: {},
      webhooks: {},
    };
  }

  private save(): void {
    try {
      writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save data file:', error);
      throw error;
    }
  }

  // User methods
  saveUser(user: UserData): void {
    // Encrypt tokens before saving
    user.oauthToken = this.encrypt(user.oauthToken);
    user.refreshToken = this.encrypt(user.refreshToken);
    user.updatedAt = new Date().toISOString();
    
    this.data.users[user.id] = user;
    this.save();
  }

  getUser(userId: string): UserData | null {
    const user = this.data.users[userId];
    if (!user) return null;
    
    // Decrypt tokens when retrieving
    return {
      ...user,
      oauthToken: this.decrypt(user.oauthToken),
      refreshToken: this.decrypt(user.refreshToken),
    };
  }

  getUserByGitLabId(gitlabUserId: number): UserData | null {
    const user = Object.values(this.data.users).find(u => u.gitlabUserId === gitlabUserId);
    if (!user) return null;
    
    return {
      ...user,
      oauthToken: this.decrypt(user.oauthToken),
      refreshToken: this.decrypt(user.refreshToken),
    };
  }

  // Project methods
  saveProject(project: ProjectConfig): void {
    project.updatedAt = new Date().toISOString();
    this.data.projects[project.id] = project;
    this.save();
  }

  getProject(projectId: string): ProjectConfig | null {
    return this.data.projects[projectId] || null;
  }

  getUserProjects(userId: string): ProjectConfig[] {
    return Object.values(this.data.projects).filter(p => p.userId === userId);
  }

  deleteProject(projectId: string): void {
    delete this.data.projects[projectId];
    this.save();
  }

  // Webhook methods
  saveWebhook(webhook: WebhookSubscription): void {
    this.data.webhooks[webhook.id] = webhook;
    this.save();
  }

  getWebhook(webhookId: string): WebhookSubscription | null {
    return this.data.webhooks[webhookId] || null;
  }

  getWebhookByProjectId(projectId: string): WebhookSubscription | null {
    return Object.values(this.data.webhooks).find(w => w.projectId === projectId) || null;
  }

  deleteWebhook(webhookId: string): void {
    delete this.data.webhooks[webhookId];
    this.save();
  }

  // Utility methods
  getAllUsers(): UserData[] {
    return Object.values(this.data.users).map(user => ({
      ...user,
      oauthToken: this.decrypt(user.oauthToken),
      refreshToken: this.decrypt(user.refreshToken),
    }));
  }

  getAllProjects(): ProjectConfig[] {
    return Object.values(this.data.projects);
  }

  getAllWebhooks(): WebhookSubscription[] {
    return Object.values(this.data.webhooks);
  }
}

let dataStore: DataStore;

export function initDataStore(config: AppConfig): DataStore {
  if (!dataStore) {
    dataStore = new DataStore(config.storage.dataPath, config.storage.encryptionKey);
  }
  return dataStore;
}

export function getDataStore(): DataStore {
  if (!dataStore) {
    throw new Error('DataStore not initialized. Call initDataStore first.');
  }
  return dataStore;
}

export function loadConfig(): AppConfig {
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  const config: AppConfig = {
    appUrl,
    gitlabUrl: process.env.GITLAB_URL || 'https://gitlab.com',
    gitlab: {
      appId: process.env.GITLAB_APP_ID || '',
      appSecret: process.env.GITLAB_APP_SECRET || '',
      redirectUri: `${appUrl}/auth/callback`,
      scope: 'api read_user read_repository write_repository',
    },
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN,
      model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229',
    },
    storage: {
      dataPath: process.env.DATA_PATH || './data/store.json',
      encryptionKey: process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'change-this-key-in-production',
    },
  };
  
  // Initialize data store
  initDataStore(config);
  
  return config;
}