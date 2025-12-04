import ms from 'ms';
import { serializeError } from 'serialize-error';

import * as config from '@/config';
import { connectDB, CloudProviderConnection } from '@/models';
import {
  CloudProvider,
  CloudSyncStatus,
  type ICloudProviderConnection,
} from '@/models/cloudProviderConnection';
import { tasksTracer } from '@/tasks/tracer';
import type { CloudMetricsCollectorArgs, HdxTask } from '@/tasks/types';
import logger from '@/utils/logger';
import { AwsCollector } from './awsCollector';
import { AzureCollector } from './azureCollector';
import { GcpCollector } from './gcpCollector';
import type { CloudCollector, CloudMetric } from './types';

// ClickHouse client
import { createClient as createClickhouseClient } from '@clickhouse/client';

export default class CloudMetricsCollectorTask
  implements HdxTask<CloudMetricsCollectorArgs>
{
  private clickhouseClient: ReturnType<typeof createClickhouseClient> | null =
    null;

  constructor(private args: CloudMetricsCollectorArgs) {}

  async execute(): Promise<void> {
    logger.info('Starting cloud metrics collection...');

    // Connect to databases
    try {
      await connectDB();
      logger.debug('Connected to MongoDB for cloud metrics collection');
    } catch (error: any) {
      logger.error(
        { error: serializeError(error) },
        'Failed to connect to MongoDB',
      );
      throw error;
    }

    // Initialize ClickHouse client
    this.clickhouseClient = createClickhouseClient({
      url: config.CLICKHOUSE_HOST,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
      request_timeout: ms('2m'),
    });

    try {
      // Get all enabled cloud provider connections
      const query: any = { enabled: true };
      
      // If connectionId specified, only process that connection
      if (this.args.connectionId) {
        query._id = this.args.connectionId;
      }

      const connections = await CloudProviderConnection.find(query).select(
        '+awsSecretAccessKey +azureClientSecret +gcpServiceAccountKey',
      );

      logger.info(
        { count: connections.length },
        'Found cloud provider connections to process',
      );

      // Process each connection
      for (const connection of connections) {
        await tasksTracer.startActiveSpan(
          `collect-cloud-metrics-${connection.provider}`,
          async span => {
            try {
              span.setAttribute('cloud.provider', connection.provider);
              span.setAttribute('connection.id', connection.id);

              await this.processConnection(connection);

              span.setStatus({ code: 0 }); // OK
            } catch (error: any) {
              span.setStatus({ code: 2, message: error.message }); // ERROR
              span.recordException(error);
            } finally {
              span.end();
            }
          },
        );
      }

      logger.info('Finished cloud metrics collection');
    } catch (error: any) {
      logger.error(
        { error: serializeError(error) },
        'Error during cloud metrics collection',
      );
      throw error;
    }
  }

  private async processConnection(
    connection: ICloudProviderConnection,
  ): Promise<void> {
    logger.info(
      {
        connectionId: connection.id,
        provider: connection.provider,
        name: connection.name,
      },
      'Processing cloud provider connection',
    );

    try {
      // Create appropriate collector based on provider
      const collector = this.createCollector(connection.provider);

      // Collect metrics
      const metrics = await collector.collect(connection);

      logger.info(
        {
          connectionId: connection.id,
          provider: connection.provider,
          metricCount: metrics.length,
        },
        'Collected cloud metrics',
      );

      // Insert metrics into ClickHouse
      if (metrics.length > 0) {
        await this.insertMetrics(metrics, connection);
      }

      // Update last sync status
      await CloudProviderConnection.updateOne(
        { _id: connection._id },
        {
          lastSyncAt: new Date(),
          lastSyncStatus: CloudSyncStatus.SUCCESS,
          $unset: { lastSyncError: 1 },
        },
      );
    } catch (error: any) {
      logger.error(
        {
          error: serializeError(error),
          connectionId: connection.id,
          provider: connection.provider,
        },
        'Failed to collect cloud metrics',
      );

      // Update error status
      await CloudProviderConnection.updateOne(
        { _id: connection._id },
        {
          lastSyncStatus: CloudSyncStatus.ERROR,
          lastSyncError: error.message || String(error),
        },
      );

      // Don't throw - continue processing other connections
    }
  }

  private createCollector(provider: CloudProvider): CloudCollector {
    switch (provider) {
      case CloudProvider.AWS:
        return new AwsCollector();
      case CloudProvider.AZURE:
        return new AzureCollector();
      case CloudProvider.GCP:
        return new GcpCollector();
      default:
        throw new Error(`Unknown cloud provider: ${provider}`);
    }
  }

  private async insertMetrics(
    metrics: CloudMetric[],
    connection: ICloudProviderConnection,
  ): Promise<void> {
    logger.debug(
      {
        connectionId: connection.id,
        metricCount: metrics.length,
      },
      'Inserting cloud metrics into ClickHouse',
    );

    // Group metrics by type
    const gaugeMetrics = metrics.filter(m => m.metricType === 'gauge');
    const sumMetrics = metrics.filter(m => m.metricType === 'sum');
    const histogramMetrics = metrics.filter(m => m.metricType === 'histogram');

    // Insert gauge metrics
    if (gaugeMetrics.length > 0) {
      await this.insertGaugeMetrics(gaugeMetrics);
    }

    // Insert sum metrics
    if (sumMetrics.length > 0) {
      await this.insertSumMetrics(sumMetrics);
    }

    // Insert histogram metrics
    if (histogramMetrics.length > 0) {
      await this.insertHistogramMetrics(histogramMetrics);
    }

    logger.info(
      {
        connectionId: connection.id,
        gauge: gaugeMetrics.length,
        sum: sumMetrics.length,
        histogram: histogramMetrics.length,
      },
      'Inserted cloud metrics into ClickHouse',
    );
  }

  private async insertGaugeMetrics(metrics: CloudMetric[]): Promise<void> {
    const rows = metrics.map(m => ({
      ResourceAttributes: m.resourceAttributes,
      ResourceSchemaUrl: '',
      ScopeName: 'cloud-metrics-collector',
      ScopeVersion: '1.0.0',
      ScopeSchemaUrl: '',
      MetricName: m.metricName,
      MetricDescription: '',
      MetricUnit: '',
      Attributes: {},
      StartTimeUnix: m.timestamp,
      TimeUnix: m.timestamp,
      Value: m.value,
      Flags: 0,
      Exemplars: [],
      ServiceName: m.resourceAttributes['service.name'],
    }));

    try {
      await this.clickhouseClient!.insert({
        table: 'default.metrics_gauge',
        values: rows,
        format: 'JSONEachRow',
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          wait_end_of_query: 1,
        },
      });
    } catch (error: any) {
      logger.error(
        { error: serializeError(error) },
        'Failed to insert gauge metrics',
      );
      throw error;
    }
  }

  private async insertSumMetrics(metrics: CloudMetric[]): Promise<void> {
    const rows = metrics.map(m => ({
      ResourceAttributes: m.resourceAttributes,
      ResourceSchemaUrl: '',
      ScopeName: 'cloud-metrics-collector',
      ScopeVersion: '1.0.0',
      ScopeSchemaUrl: '',
      MetricName: m.metricName,
      MetricDescription: '',
      MetricUnit: '',
      Attributes: {},
      StartTimeUnix: m.timestamp,
      TimeUnix: m.timestamp,
      Value: m.value,
      Flags: 0,
      Exemplars: [],
      AggregationTemporality: 2, // Cumulative
      IsMonotonic: true,
      ServiceName: m.resourceAttributes['service.name'],
    }));

    try {
      await this.clickhouseClient!.insert({
        table: 'default.metrics_sum',
        values: rows,
        format: 'JSONEachRow',
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          wait_end_of_query: 1,
        },
      });
    } catch (error: any) {
      logger.error(
        { error: serializeError(error) },
        'Failed to insert sum metrics',
      );
      throw error;
    }
  }

  private async insertHistogramMetrics(metrics: CloudMetric[]): Promise<void> {
    // TODO: Implement histogram metrics insertion if needed
    logger.warn('Histogram metrics insertion not yet implemented');
  }

  name(): string {
    return this.args.taskName;
  }

  async asyncDispose(): Promise<void> {
    if (this.clickhouseClient) {
      await this.clickhouseClient.close();
    }
  }
}
