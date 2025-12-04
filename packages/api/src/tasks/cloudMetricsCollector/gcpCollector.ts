import type { ICloudProviderConnection } from '@/models/cloudProviderConnection';
import logger from '@/utils/logger';
import type { CloudCollector, CloudMetric, GcpResourceType, GCP_RESOURCE_TYPES } from './types';

// TODO: Install GCP SDK package:
// - @google-cloud/monitoring

export class GcpCollector implements CloudCollector {
  getAvailableResourceTypes(): string[] {
    return ['compute-instance', 'cloud-sql', 'load-balancer', 'cloud-function', 'cloud-storage'];
  }

  async testConnection(connection: ICloudProviderConnection): Promise<boolean> {
    // TODO: Implement GCP connection test using service account JSON key
    logger.warn('GCP connection test not yet implemented');
    return false;
  }

  async collect(connection: ICloudProviderConnection): Promise<CloudMetric[]> {
    // TODO: Implement GCP metrics collection
    // 1. Parse service account key JSON from connection.gcpServiceAccountKey
    // 2. Use @google-cloud/monitoring MetricServiceClient
    // 3. Support Compute Engine, Cloud SQL, Load Balancing, Cloud Functions, Cloud Storage
    
    logger.warn({ connectionId: connection.id }, 'GCP metrics collection not yet implemented');
    return [];
  }
}

/*
 * Example implementation outline:
 * 
 * import { MetricServiceClient } from '@google-cloud/monitoring';
 * 
 * const credentials = JSON.parse(connection.gcpServiceAccountKey!);
 * const client = new MetricServiceClient({ credentials });
 * 
 * // List time series for Compute Engine CPU
 * const request = {
 *   name: `projects/${connection.gcpProjectId}`,
 *   filter: 'metric.type="compute.googleapis.com/instance/cpu/utilization"',
 *   interval: {
 *     startTime: { seconds: Date.now() / 1000 - 600 },
 *     endTime: { seconds: Date.now() / 1000 },
 *   },
 * };
 * 
 * const [timeSeries] = await client.listTimeSeries(request);
 */
