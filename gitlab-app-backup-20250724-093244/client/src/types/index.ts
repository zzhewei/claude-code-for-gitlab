export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
  gitlab_user_id: number;
}

export interface Project {
  id: number;
  name: string;
  path_with_namespace: string;
  description?: string;
  avatar_url?: string;
  web_url: string;
  claudeEnabled: boolean;
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
    model: string;
    maxTurns: number;
    allowedTools?: string[];
  };
  webhookId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => void;
  refetch: () => void;
}