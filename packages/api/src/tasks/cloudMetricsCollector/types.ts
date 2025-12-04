// Cloud metric collector types and interfaces

export interface CloudMetric {
  metricName: string; // e.g., "CPUUtilization", "MemoryUtilization"
  metricType: 'gauge' | 'sum' | 'histogram';
  value: number;
  timestamp: Date;
  resourceAttributes: {
    'cloud.provider': 'aws' | 'azure' | 'gcp';
    'cloud.resource.id': string;
    'cloud.resource.type': string; // 'ec2-instance', 'rds-instance', 'vm', etc.
    'cloud.region': string;
    'service.name': string;
    [key: string]: string; // additional tags
  };
}

export interface CloudCollector {
  /**
   * Collect metrics from the cloud provider
   */
  collect(
    connection: any, // ICloudProviderConnection
  ): Promise<CloudMetric[]>;

  /**
   * Test the connection credentials
   */
  testConnection(connection: any): Promise<boolean>;

  /**
   * Get available resource types for this provider
   */
  getAvailableResourceTypes(): string[];
}

// AWS Resource Types
export const AWS_RESOURCE_TYPES = [
  'ec2',
  'rds',
  'elb',
  'alb',
  'lambda',
  's3',
] as const;

export type AwsResourceType = (typeof AWS_RESOURCE_TYPES)[number];

// Azure Resource Types
export const AZURE_RESOURCE_TYPES = [
  'vm',
  'sql-database',
  'load-balancer',
  'app-service',
  'storage-account',
] as const;

export type AzureResourceType = (typeof AZURE_RESOURCE_TYPES)[number];

// GCP Resource Types
export const GCP_RESOURCE_TYPES = [
  'compute-instance',
  'cloud-sql',
  'load-balancer',
  'cloud-function',
  'cloud-storage',
] as const;

export type GcpResourceType = (typeof GCP_RESOURCE_TYPES)[number];
