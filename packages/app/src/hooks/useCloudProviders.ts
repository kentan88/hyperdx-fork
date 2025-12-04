import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hdxServer } from '@/api';

export interface CloudProviderConnection {
  id: string;
  provider: 'aws' | 'azure' | 'gcp';
  name: string;
  enabled: boolean;
  pollingIntervalMinutes: number;
  resourceTypes: string[];
  resourceTags?: Record<string, string>;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'pending';
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
  
  // AWS fields (only returned if user has access)
  awsAccessKeyId?: string;
  awsRegion?: string;
  awsRoleArn?: string;
  
  // Azure fields
  azureClientId?: string;
  azureTenantId?: string;
  azureSubscriptionId?: string;
  
  // GCP fields
  gcpProjectId?: string;
}

export interface CreateCloudProviderConnection {
  provider: 'aws' | 'azure' | 'gcp';
  name: string;
  enabled?: boolean;
  
  // AWS
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  awsRoleArn?: string;
  
  // Azure
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureSubscriptionId?: string;
  
  // GCP
  gcpProjectId?: string;
  gcpServiceAccountKey?: string;
  
  // Config
  pollingIntervalMinutes?: number;
  resourceTypes?: string[];
  resourceTags?: Record<string, string>;
}

export function useCloudProviderConnections() {
  return useQuery({
    queryKey: ['cloudProviders'],
    queryFn: () => hdxServer('cloud-providers', { method: 'GET' }).json() as Promise<CloudProviderConnection[]>,
  });
}

export function useCreateCloudProvider() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateCloudProviderConnection) =>
      hdxServer('cloud-providers', {
        method: 'POST',
        json: data,
      }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudProviders'] });
    },
  });
}

export function useUpdateCloudProvider() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateCloudProviderConnection>;
    }) =>
      hdxServer(`cloud-providers/${id}`, {
        method: 'PUT',
        json: data,
      }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudProviders'] });
    },
  });
}

export function useDeleteCloudProvider() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) =>
      hdxServer(`cloud-providers/${id}`, {
        method: 'DELETE',
      }).text(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudProviders'] });
    },
  });
}

export function useTestCloudProvider() {
  return useMutation({
    mutationFn: async (id: string) =>
      hdxServer(`cloud-providers/${id}/test`, {
        method: 'POST',
      }).json() as Promise<{ success: boolean }>,
  });
}

export function useSyncCloudProvider() {
  return useMutation({
    mutationFn: async (id: string) =>
      hdxServer(`cloud-providers/${id}/sync`, {
        method: 'POST',
      }).json(),
  });
}
