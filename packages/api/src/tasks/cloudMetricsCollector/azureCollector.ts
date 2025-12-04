import type { ICloudProviderConnection } from '@/models/cloudProviderConnection';
import logger from '@/utils/logger';
import type { AzureResourceType, CloudCollector, CloudMetric, AZURE_RESOURCE_TYPES } from './types';

// TODO: Install Azure SDK packages:
// - @azure/monitor-query
// - @azure/identity

export class AzureCollector implements CloudCollector {
  getAvailableResourceTypes(): string[] {
    return ['vm', 'sql-database', 'load-balancer', 'app-service', 'storage-account'];
  }

  async testConnection(connection: ICloudProviderConnection): Promise<boolean> {
    // TODO: Implement Azure connection test using Azure Identity
    logger.warn('Azure connection test not yet implemented');
    return false;
  }

  async collect(connection: ICloudProviderConnection): Promise<CloudMetric[]> {
    // TODO: Implement Azure metrics collection
    // 1. Use @azure/identity to create credentials from clientId/clientSecret/tenantId
    // 2. Use @azure/monitor-query to fetch metrics
    // 3. Support VM, SQL Database, Load Balancer, App Service, Storage Account
    
    logger.warn({ connectionId: connection.id }, 'Azure metrics collection not yet implemented');
    return [];
  }
}

/*
 * Example implementation outline:
 * 
 * import { ClientSecretCredential } from '@azure/identity';
 * import { MetricsQueryClient } from '@azure/monitor-query';
 * 
 * const credential = new ClientSecretCredential(
 *   connection.azureTenantId!,
 *   connection.azureClientId!,
 *   connection.azureClientSecret!
 * );
 * 
 * const metricsClient = new MetricsQueryClient(credential);
 * 
 * // Get VM metrics
 * const resourceId = `/subscriptions/${connection.azureSubscriptionId}/resourceGroups/...`;
 * const response = await metricsClient.queryResource(
 *   resourceId,
 *   ['Percentage CPU', 'Network In', 'Network Out'],
 *   {
 *     granularity: 'PT5M',
 *     timespan: { duration: 'PT1H' }
 *   }
 * );
 */
