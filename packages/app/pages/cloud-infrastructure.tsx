import {
  Badge,
  Card,
  Container,
  Grid,
  Group,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { IconCloud } from '@tabler/icons-react';
import { useState } from 'react';
import Head from 'next/head';

import { PageHeader } from '@/components/PageHeader';
import { useCloudProviderConnections } from '../src/hooks/useCloudProviders';
import { DBTimeChart } from '../src/components/DBTimeChart';
import { ChartBox } from '../src/components/ChartBox';
import { withAppNav } from '../src/layout';

// Simple hook to get metrics source - placeholder for now
// In practice, this would fetch the actual source configuration
function useMetricsSource() {
  return {
    connection: '', // Will need to be populated from cloud provider connection
    from: { databaseName: 'default', tableName: 'metrics_gauge' },
    timestampValueExpression: 'TimeUnix',
  };
}

function CloudInfrastructurePage() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>('all');
  const [timeRange, setTimeRange] = useState<'30m' | '1h' | '6h' | '1d'>('1h');
  
  const { data: connections, isLoading } = useCloudProviderConnections();
  const metricsSource = useMetricsSource();

  const providerOptions = [
    { value: 'all', label: 'All Providers' },
    { value: 'aws', label: 'AWS' },
    { value: 'azure', label: 'Azure' },
    { value: 'gcp', label: 'GCP' },
  ];

  const timeRangeOptions = [
    { value: '30m', label: 'Last 30 minutes' },
    { value: '1h', label: 'Last 1 hour' },
    { value: '6h', label: 'Last 6 hours' },
    { value: '1d', label: 'Last 24 hours' },
  ];

  const activeConnections = connections?.filter(c => c.enabled) || [];
  const hasActiveConnections = activeConnections.length > 0;

  // Build date range from time selection
  const dateRange: [Date, Date] = (() => {
    const endTime = new Date();
    const startTime = new Date();
    switch (timeRange) {
      case '30m':
        startTime.setMinutes(endTime.getMinutes() - 30);
        break;
      case '1h':
        startTime.setHours(endTime.getHours() - 1);
        break;
      case '6h':
        startTime.setHours(endTime.getHours() - 6);
        break;
      case '1d':
        startTime.setDate(endTime.getDate() - 1);
        break;
    }
    return [startTime, endTime];
  })();

  // Build where clause based on selected provider
  const buildWhereClause = (metricName?: string) => {
    const conditions: string[] = [];
    
    if (selectedProvider && selectedProvider !== 'all') {
      conditions.push(`ResourceAttributes['cloud.provider'] = '${selectedProvider}'`);
    } else {
      conditions.push(`ResourceAttributes['cloud.provider'] IN ('aws', 'azure', 'gcp')`);
    }
    
    if (metricName) {
      conditions.push(`MetricName = '${metricName}'`);
    }
    
    return conditions.join(' AND ');
  };

  return (
    <div className="CloudInfrastructurePage">
      <Head>
        <title>Cloud Infrastructure - HyperDX</title>
      </Head>
      
      <PageHeader>
        <Group position="apart" w="100%">
          <div>
            <Group spacing="sm">
              <IconCloud size={24} />
              <div>Cloud Infrastructure</div>
            </Group>
          </div>
          <Group>
            <Select
              placeholder="Filter by provider"
              value={selectedProvider}
              onChange={setSelectedProvider}
              data={providerOptions}
              style={{ width: 180 }}
            />
            <Select
              value={timeRange}
              onChange={(val: '30m' | '1h' | '6h' | '1d') => setTimeRange(val)}
              data={timeRangeOptions}
              style={{ width: 180 }}
            />
          </Group>
        </Group>
      </PageHeader>

      <div className="my-4">
        <Container maw={1500}>
          {isLoading ? (
            <Text>Loading...</Text>
          ) : !hasActiveConnections ? (
            <Card shadow="sm" p="xl" radius="md" withBorder>
              <Stack align="center" spacing="md" py="xl">
                <IconCloud size={64} stroke={1} color="gray" />
                <Text size="lg" weight={600}>No Active Cloud Providers</Text>
                <Text color="dimmed" align="center" size="sm">
                  Configure and enable cloud provider connections to start
                  monitoring your infrastructure metrics.
                </Text>
                <Text color="dimmed" align="center" size="sm">
                  Go to{' '}
                  <a href="/cloud-providers" style={{ color: '#228be6' }}>
                    Cloud Providers
                  </a>{' '}
                  to get started.
                </Text>
              </Stack>
            </Card>
          ) : (
            <Stack spacing="xl">
              {/* Summary Cards */}
              <Group grow>
                <Card shadow="sm" p="md" radius="md" withBorder>
                  <Text size="sm" color="dimmed" weight={500}>
                    Active Connections
                  </Text>
                  <Text size="xl" weight={700} mt="sm">
                    {activeConnections.length}
                  </Text>
                </Card>
                
                <Card shadow="sm" p="md" radius="md" withBorder>
                  <Text size="sm" color="dimmed" weight={500}>
                    Providers
                  </Text>
                  <Group mt="sm" spacing="xs">
                    {Array.from(
                      new Set(activeConnections.map(c => c.provider))
                    ).map(provider => (
                      <Badge key={provider}>{provider.toUpperCase()}</Badge>
                    ))}
                  </Group>
                </Card>
                
                <Card shadow="sm" p="md" radius="md" withBorder>
                  <Text size="sm" color="dimmed" weight={500}>
                    Last Sync
                  </Text>
                  <Text size="sm" mt="sm">
                    {activeConnections.length > 0 &&
                    activeConnections[0].lastSyncAt
                      ? new Date(
                          activeConnections[0].lastSyncAt
                        ).toLocaleString()
                      : 'Pending'}
                  </Text>
                </Card>
              </Group>

              {/* CPU Utilization Chart */}
              <Grid>
                <Grid.Col span={6}>
                  <ChartBox style={{ minHeight: 400 }}>
                    <Text size="sm" mb="sm" weight={600}>
                      CPU Utilization (%)
                    </Text>
                    <DBTimeChart
                      config={{
                        select: [
                          {
                            aggFn: 'avg',
                            valueExpression: 'Value',
                            aggCondition: buildWhereClause('CPUUtilization'),
                          },
                        ],
                        displayType: 'Line' as const,
                        dateRange,
                        connection: metricsSource.connection,
                        timestampValueExpression: metricsSource.timestampValueExpression,
                        from: metricsSource.from,
                        granularity: 'auto',
                        groupBy: "ResourceAttributes['cloud.resource.id']",
                        where: buildWhereClause('CPUUtilization'),
                      }}
                    />
                  </ChartBox>
                </Grid.Col>

                {/* Network In Chart */}
                <Grid.Col span={6}>
                  <ChartBox style={{ minHeight: 400 }}>
                    <Text size="sm" mb="sm" weight={600}>
                      Network In (Bytes)
                    </Text>
                    <DBTimeChart
                      config={{
                        select: [
                          {
                            aggFn: 'avg',
                            valueExpression: 'Value',
                            aggCondition: buildWhereClause('NetworkIn'),
                          },
                        ],
                        displayType: 'Line' as const,
                        dateRange,
                        connection: metricsSource.connection,
                        timestampValueExpression: metricsSource.timestampValueExpression,
                        from: metricsSource.from,
                        granularity: 'auto',
                        groupBy: "ResourceAttributes['cloud.resource.id']",
                        where: buildWhereClause('NetworkIn'),
                      }}
                    />
                  </ChartBox>
                </Grid.Col>

                {/* Lambda Invocations (if AWS selected) */}
                {(selectedProvider === 'all' || selectedProvider === 'aws') && (
                  <Grid.Col span={6}>
                    <ChartBox style={{ minHeight: 400 }}>
                      <Text size="sm" mb="sm" weight={600}>
                        Lambda Invocations
                      </Text>
                      <DBTimeChart
                        config={{
                          select: [
                            {
                              aggFn: 'sum',
                              valueExpression: 'Value',
                              aggCondition: buildWhereClause('Invocations'),
                            },
                          ],
                          displayType: 'Line' as const,
                          dateRange,
                          connection: metricsSource.connection,
                          timestampValueExpression: metricsSource.timestampValueExpression,
                          from: metricsSource.from,
                          granularity: 'auto',
                          groupBy: "ResourceAttributes['cloud.resource.id']",
                          where: buildWhereClause('Invocations'),
                        }}
                      />
                    </ChartBox>
                  </Grid.Col>
                )}

                {/* Database Connections (RDS) */}
                {(selectedProvider === 'all' || selectedProvider === 'aws') && (
                  <Grid.Col span={6}>
                    <ChartBox style={{ minHeight: 400 }}>
                      <Text size="sm" mb="sm" weight={600}>
                        Database Connections
                      </Text>
                      <DBTimeChart
                        config={{
                          select: [
                            {
                              aggFn: 'avg',
                              valueExpression: 'Value',
                              aggCondition: buildWhereClause('DatabaseConnections'),
                            },
                          ],
                          displayType: 'Line' as const,
                          dateRange,
                          connection: metricsSource.connection,
                          timestampValueExpression: metricsSource.timestampValueExpression,
                          from: metricsSource.from,
                          granularity: 'auto',
                          groupBy: "ResourceAttributes['cloud.resource.id']",
                          where: buildWhereClause('DatabaseConnections'),
                        }}
                      />
                    </ChartBox>
                  </Grid.Col>
                )}
              </Grid>

              {/* Connection Status List */}
              <Card shadow="sm" p="md" radius="md" withBorder>
                <Text size="lg" weight={600} mb="md">
                  Connection Status
                </Text>
                <Stack spacing="sm">
                  {activeConnections
                    .filter(
                      c =>
                        selectedProvider === 'all' ||
                        c.provider === selectedProvider
                    )
                    .map(connection => (
                      <Group key={connection.id} position="apart">
                        <Group>
                          <Badge>{connection.provider.toUpperCase()}</Badge>
                          <Text weight={500}>{connection.name}</Text>
                        </Group>
                        <Group spacing="xs">
                          <Text size="sm" color="dimmed">
                            {connection.resourceTypes.length} resource types
                          </Text>
                          {connection.lastSyncStatus === 'success' ? (
                            <Badge color="green">✓ Synced</Badge>
                          ) : connection.lastSyncStatus === 'error' ? (
                            <Badge color="red">✗ Error</Badge>
                          ) : (
                            <Badge color="yellow">Pending</Badge>
                          )}
                        </Group>
                      </Group>
                    ))}
                </Stack>
              </Card>
            </Stack>
          )}
        </Container>
      </div>
    </div>
  );
}

CloudInfrastructurePage.getLayout = withAppNav;

export default CloudInfrastructurePage;
