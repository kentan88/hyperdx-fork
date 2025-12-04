import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  ListMetricsCommand,
} from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { DescribeDBInstancesCommand, RDSClient } from '@aws-sdk/client-rds';
import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import {
  DescribeLoadBalancersCommand,
  ElasticLoadBalancingV2Client,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { fromEnv, fromIni } from '@aws-sdk/credential-providers';
import type { ICloudProviderConnection } from '@/models/cloudProviderConnection';
import logger from '@/utils/logger';
import {
  AWS_RESOURCE_TYPES,
  type AwsResourceType,
  type CloudCollector,
  type CloudMetric,
} from './types';

export class AwsCollector implements CloudCollector {
  private cloudWatchClient: CloudWatchClient | null = null;
  private ec2Client: EC2Client | null = null;
  private rdsClient: RDSClient | null = null;
  private elbClient: ElasticLoadBalancingV2Client | null = null;
  private lambdaClient: LambdaClient | null = null;
  private dynamoDbClient: DynamoDBClient | null = null;
  private s3Client: S3Client | null = null;

  getAvailableResourceTypes(): string[] {
    return [...AWS_RESOURCE_TYPES];
  }

  private getCredentials(connection: ICloudProviderConnection) {
    if (connection.awsRoleArn) {
      // TODO: Implement assume role
      return fromEnv();
    }

    if (connection.awsAccessKeyId && connection.awsSecretAccessKey) {
      return {
        accessKeyId: connection.awsAccessKeyId,
        secretAccessKey: connection.awsSecretAccessKey,
      };
    }

    // Fallback to default credential chain
    return fromEnv();
  }

  private initializeClients(connection: ICloudProviderConnection) {
    const credentials = this.getCredentials(connection);
    const region = connection.awsRegion || 'us-east-1';

    this.cloudWatchClient = new CloudWatchClient({ region, credentials });
    this.ec2Client = new EC2Client({ region, credentials });
    this.rdsClient = new RDSClient({ region, credentials });
    this.elbClient = new ElasticLoadBalancingV2Client({ region, credentials });
    this.lambdaClient = new LambdaClient({ region, credentials });
    this.dynamoDbClient = new DynamoDBClient({ region, credentials });
    this.s3Client = new S3Client({ region, credentials });
  }

  async testConnection(connection: ICloudProviderConnection): Promise<boolean> {
    try {
      this.initializeClients(connection);
      
      // Test by listing EC2 instances (lightweight operation)
      const command = new DescribeInstancesCommand({ MaxResults: 1 });
      await this.ec2Client!.send(command);
      
      return true;
    } catch (error: any) {
      logger.error({ error, connectionId: connection.id }, 'AWS connection test failed');
      return false;
    }
  }

  async collect(connection: ICloudProviderConnection): Promise<CloudMetric[]> {
    this.initializeClients(connection);

    const metrics: CloudMetric[] = [];
    const resourceTypes = connection.resourceTypes || [];

    try {
      if (resourceTypes.includes('ec2')) {
        const ec2Metrics = await this.collectEC2Metrics(connection);
        metrics.push(...ec2Metrics);
      }

      if (resourceTypes.includes('rds')) {
        const rdsMetrics = await this.collectRDSMetrics(connection);
        metrics.push(...rdsMetrics);
      }

      if (resourceTypes.includes('elb') || resourceTypes.includes('alb')) {
        const elbMetrics = await this.collectELBMetrics(connection);
        metrics.push(...elbMetrics);
      }

      if (resourceTypes.includes('lambda')) {
        const lambdaMetrics = await this.collectLambdaMetrics(connection);
        metrics.push(...lambdaMetrics);
      }

      if (resourceTypes.includes('dynamodb')) {
        const dynamoMetrics = await this.collectDynamoDBMetrics(connection);
        metrics.push(...dynamoMetrics);
      }

      if (resourceTypes.includes('s3')) {
        const s3Metrics = await this.collectS3Metrics(connection);
        metrics.push(...s3Metrics);
      }
    } catch (error: any) {
      logger.error(
        { error, connectionId: connection.id },
        'Error collecting AWS metrics',
      );
      throw error;
    }

    return metrics;
  }

  private async collectEC2Metrics(
    connection: ICloudProviderConnection,
  ): Promise<CloudMetric[]> {
    const metrics: CloudMetric[] = [];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 10 * 60 * 1000); // Last 10 minutes

    try {
      // Get all EC2 instances
      const describeCommand = new DescribeInstancesCommand({});
      const instances = await this.ec2Client!.send(describeCommand);

      const instanceIds: string[] = [];
      instances.Reservations?.forEach(reservation => {
        reservation.Instances?.forEach(instance => {
          if (instance.InstanceId && instance.State?.Name === 'running') {
            instanceIds.push(instance.InstanceId);
          }
        });
      });

      // Collect metrics for each instance
      for (const instanceId of instanceIds) {
        // CPU Utilization
        const cpuMetrics = await this.getCloudWatchMetric(
          'AWS/EC2',
          'CPUUtilization',
          [{ Name: 'InstanceId', Value: instanceId }],
          startTime,
          endTime,
        );

        cpuMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'CPUUtilization',
            metricType: 'gauge',
            value: datapoint.Average || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': instanceId,
              'cloud.resource.type': 'ec2-instance',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `ec2-${instanceId}`,
            },
          });
        });

        // Network In
        const networkInMetrics = await this.getCloudWatchMetric(
          'AWS/EC2',
          'NetworkIn',
          [{ Name: 'InstanceId', Value: instanceId }],
          startTime,
          endTime,
        );

        networkInMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'NetworkIn',
            metricType: 'gauge',
            value: datapoint.Average || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': instanceId,
              'cloud.resource.type': 'ec2-instance',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `ec2-${instanceId}`,
            },
          });
        });
      }
    } catch (error: any) {
      logger.error({ error }, 'Error collecting EC2 metrics');
    }

    return metrics;
  }

  private async collectRDSMetrics(
    connection: ICloudProviderConnection,
  ): Promise<CloudMetric[]> {
    const metrics: CloudMetric[] = [];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 10 * 60 * 1000);

    try {
      // Get all RDS instances
      const describeCommand = new DescribeDBInstancesCommand({});
      const dbInstances = await this.rdsClient!.send(describeCommand);

      const dbInstanceIds: string[] = [];
      dbInstances.DBInstances?.forEach(instance => {
        if (instance.DBInstanceIdentifier) {
          dbInstanceIds.push(instance.DBInstanceIdentifier);
        }
      });

      // Collect metrics for each RDS instance
      for (const dbInstanceId of dbInstanceIds) {
        // CPU Utilization
        const cpuMetrics = await this.getCloudWatchMetric(
          'AWS/RDS',
          'CPUUtilization',
          [{ Name: 'DBInstanceIdentifier', Value: dbInstanceId }],
          startTime,
          endTime,
        );

        cpuMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'CPUUtilization',
            metricType: 'gauge',
            value: datapoint.Average || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': dbInstanceId,
              'cloud.resource.type': 'rds-instance',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `rds-${dbInstanceId}`,
            },
          });
        });

        // Database Connections
        const connectionMetrics = await this.getCloudWatchMetric(
          'AWS/RDS',
          'DatabaseConnections',
          [{ Name: 'DBInstanceIdentifier', Value: dbInstanceId }],
          startTime,
          endTime,
        );

        connectionMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'DatabaseConnections',
            metricType: 'gauge',
            value: datapoint.Average || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': dbInstanceId,
              'cloud.resource.type': 'rds-instance',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `rds-${dbInstanceId}`,
            },
          });
        });
      }
    } catch (error: any) {
      logger.error({ error }, 'Error collecting RDS metrics');
    }

    return metrics;
  }

  private async collectELBMetrics(
    connection: ICloudProviderConnection,
  ): Promise<CloudMetric[]> {
    const metrics: CloudMetric[] = [];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 10 * 60 * 1000);

    try {
      // Get all load balancers
      const describeCommand = new DescribeLoadBalancersCommand({});
      const loadBalancers = await this.elbClient!.send(describeCommand);

      const lbArns: string[] = [];
      loadBalancers.LoadBalancers?.forEach(lb => {
        if (lb.LoadBalancerArn) {
          lbArns.push(lb.LoadBalancerArn);
        }
      });

      // Collect metrics for each load balancer
      for (const lbArn of lbArns) {
        const lbName = lbArn.split('/').pop() || lbArn;

        // Request Count
        const requestMetrics = await this.getCloudWatchMetric(
          'AWS/ApplicationELB',
          'RequestCount',
          [{ Name: 'LoadBalancer', Value: lbName }],
          startTime,
          endTime,
        );

        requestMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'RequestCount',
            metricType: 'sum',
            value: datapoint.Sum || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': lbArn,
              'cloud.resource.type': 'application-load-balancer',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `alb-${lbName}`,
            },
          });
        });
      }
    } catch (error: any) {
      logger.error({ error }, 'Error collecting ELB metrics');
    }

    return metrics;
  }

  private async getCloudWatchMetric(
    namespace: string,
    metricName: string,
    dimensions: { Name: string; Value: string }[],
    startTime: Date,
    endTime: Date,
  ) {
    try {
      const command = new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensions,
        StartTime: startTime,
        EndTime: endTime,
        Period: 300, // 5 minutes
        Statistics: ['Average', 'Maximum', 'Minimum', 'Sum'],
      });

      const response = await this.cloudWatchClient!.send(command);
      return response.Datapoints || [];
    } catch (error: any) {
      logger.error({ error, namespace, metricName }, 'Error fetching CloudWatch metric');
      return [];
    }
  }

  private async collectLambdaMetrics(
    connection: ICloudProviderConnection,
  ): Promise<CloudMetric[]> {
    const metrics: CloudMetric[] = [];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 10 * 60 * 1000);

    try {
      // Get all Lambda functions
      const listCommand = new ListFunctionsCommand({});
      const functions = await this.lambdaClient!.send(listCommand);

      const functionNames: string[] = [];
      functions.Functions?.forEach(func => {
        if (func.FunctionName) {
          functionNames.push(func.FunctionName);
        }
      });

      // Collect metrics for each function
      for (const functionName of functionNames) {
        // Invocations
        const invocationMetrics = await this.getCloudWatchMetric(
          'AWS/Lambda',
          'Invocations',
          [{ Name: 'FunctionName', Value: functionName }],
          startTime,
          endTime,
        );

        invocationMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'Invocations',
            metricType: 'sum',
            value: datapoint.Sum || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': functionName,
              'cloud.resource.type': 'lambda-function',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `lambda-${functionName}`,
            },
          });
        });

        // Errors
        const errorMetrics = await this.getCloudWatchMetric(
          'AWS/Lambda',
          'Errors',
          [{ Name: 'FunctionName', Value: functionName }],
          startTime,
          endTime,
        );

        errorMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'Errors',
            metricType: 'sum',
            value: datapoint.Sum || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': functionName,
              'cloud.resource.type': 'lambda-function',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `lambda-${functionName}`,
            },
          });
        });

        // Duration
        const durationMetrics = await this.getCloudWatchMetric(
          'AWS/Lambda',
          'Duration',
          [{ Name: 'FunctionName', Value: functionName }],
          startTime,
          endTime,
        );

        durationMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'Duration',
            metricType: 'gauge',
            value: datapoint.Average || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': functionName,
              'cloud.resource.type': 'lambda-function',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `lambda-${functionName}`,
            },
          });
        });
      }
    } catch (error: any) {
      logger.error({ error }, 'Error collecting Lambda metrics');
    }

    return metrics;
  }

  private async collectDynamoDBMetrics(
    connection: ICloudProviderConnection,
  ): Promise<CloudMetric[]> {
    const metrics: CloudMetric[] = [];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 10 * 60 * 1000);

    try {
      // Get all DynamoDB tables
      const listCommand = new ListTablesCommand({});
      const tables = await this.dynamoDbClient!.send(listCommand);

      const tableNames = tables.TableNames || [];

      // Collect metrics for each table
      for (const tableName of tableNames) {
        // Consumed Read Capacity
        const readCapacityMetrics = await this.getCloudWatchMetric(
          'AWS/DynamoDB',
          'ConsumedReadCapacityUnits',
          [{ Name: 'TableName', Value: tableName }],
          startTime,
          endTime,
        );

        readCapacityMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'ConsumedReadCapacityUnits',
            metricType: 'sum',
            value: datapoint.Sum || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': tableName,
              'cloud.resource.type': 'dynamodb-table',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `dynamodb-${tableName}`,
            },
          });
        });

        // Consumed Write Capacity
        const writeCapacityMetrics = await this.getCloudWatchMetric(
          'AWS/DynamoDB',
          'ConsumedWriteCapacityUnits',
          [{ Name: 'TableName', Value: tableName }],
          startTime,
          endTime,
        );

        writeCapacityMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'ConsumedWriteCapacityUnits',
            metricType: 'sum',
            value: datapoint.Sum || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': tableName,
              'cloud.resource.type': 'dynamodb-table',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `dynamodb-${tableName}`,
            },
          });
        });
      }
    } catch (error: any) {
      logger.error({ error }, 'Error collecting DynamoDB metrics');
    }

    return metrics;
  }

  private async collectS3Metrics(
    connection: ICloudProviderConnection,
  ): Promise<CloudMetric[]> {
    const metrics: CloudMetric[] = [];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours for S3

    try {
      // Get all S3 buckets
      const listCommand = new ListBucketsCommand({});
      const buckets = await this.s3Client!.send(listCommand);

      const bucketNames: string[] = [];
      buckets.Buckets?.forEach(bucket => {
        if (bucket.Name) {
          bucketNames.push(bucket.Name);
        }
      });

      // Collect metrics for each bucket
      for (const bucketName of bucketNames) {
        // Number of Objects
        const objectCountMetrics = await this.getCloudWatchMetric(
          'AWS/S3',
          'NumberOfObjects',
          [
            { Name: 'BucketName', Value: bucketName },
            { Name: 'StorageType', Value: 'AllStorageTypes' },
          ],
          startTime,
          endTime,
        );

        objectCountMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'NumberOfObjects',
            metricType: 'gauge',
            value: datapoint.Average || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': bucketName,
              'cloud.resource.type': 's3-bucket',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `s3-${bucketName}`,
            },
          });
        });

        // Bucket Size Bytes
        const sizeMetrics = await this.getCloudWatchMetric(
          'AWS/S3',
          'BucketSizeBytes',
          [
            { Name: 'BucketName', Value: bucketName },
            { Name: 'StorageType', Value: 'StandardStorage' },
          ],
          startTime,
          endTime,
        );

        sizeMetrics.forEach(datapoint => {
          metrics.push({
            metricName: 'BucketSizeBytes',
            metricType: 'gauge',
            value: datapoint.Average || 0,
            timestamp: datapoint.Timestamp || new Date(),
            resourceAttributes: {
              'cloud.provider': 'aws',
              'cloud.resource.id': bucketName,
              'cloud.resource.type': 's3-bucket',
              'cloud.region': connection.awsRegion || 'us-east-1',
              'service.name': `s3-${bucketName}`,
            },
          });
        });
      }
    } catch (error: any) {
      logger.error({ error }, 'Error collecting S3 metrics');
    }

    return metrics;
  }
}
