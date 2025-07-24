import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { Project, ProjectConfig } from '../types';

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/api/projects');
      return response.data;
    },
  });
}

export function useProjectConfig(projectId: string) {
  return useQuery<ProjectConfig>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await api.get(`/api/projects/${projectId}`);
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useEnableProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (projectId: number) => {
      const response = await api.post(`/api/projects/${projectId}/enable`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDisableProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (projectId: number) => {
      const response = await api.post(`/api/projects/${projectId}/disable`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProjectSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      projectId, 
      settings 
    }: { 
      projectId: number; 
      settings: {
        triggerPhrase?: string;
        model?: string;
        maxTurns?: number;
        allowedTools?: string[];
      };
    }) => {
      const response = await api.put(`/api/projects/${projectId}/settings`, settings);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project', variables.projectId.toString()] });
    },
  });
}