import React, { useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
  LoadingOverlay,
  Grid,
  Paper,
  Switch,
  Divider,
} from '@mantine/core';
import { IconTrash, IconArrowLeft, IconEdit, IconPlus } from '@tabler/icons-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { WebhookService } from '@hyperdx/common-utils/dist/types';
import { notifications } from '@mantine/notifications';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';

import api from './api';
import SLOStatusCard from './components/SLOStatusCard';
import { useNewTimeQuery, parseTimeQuery } from './timeQuery';
import { TimePicker } from './components/TimePicker';
import { useConfirm } from './useConfirm';

function BubbleUpAnalysis({
  sloId,
  timeStart,
  timeEnd,
}: {
  sloId: string;
  timeStart: Date;
  timeEnd: Date;
}) {
  const { data, isLoading } = api.useSLOBubbleUp(sloId, timeStart, timeEnd);

  if (isLoading)
    return (
      <Box py="xl" pos="relative" mih={200}>
        <LoadingOverlay visible />
      </Box>
    );

  if (!data || data.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No significant correlations found or BubbleUp not supported for this
        SLO. Try a larger time window or ensure the SLO was created with the
        builder.
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      {data.map((attr: any) => (
        <Card key={attr.attribute} withBorder padding="sm">
          <Text
            fw={500}
            size="sm"
            mb="xs"
            style={{ textTransform: 'capitalize' }}
          >
            {attr.attribute}
          </Text>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr
                  style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}
                >
                  <th style={{ padding: '8px' }}>Value</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>
                    Bad Events
                  </th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>
                    Good Events
                  </th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>% Bad</th>
                </tr>
              </thead>
              <tbody>
                {attr.values.map((val: any) => {
                  const total = val.badCount + val.goodCount;
                  const pctBad = total > 0 ? (val.badCount / total) * 100 : 0;
                  return (
                    <tr
                      key={val.value}
                      style={{ borderBottom: '1px solid #f5f5f5' }}
                    >
                      <td
                        style={{
                          padding: '8px',
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={val.value}
                      >
                        {val.value}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {val.badCount}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {val.goodCount}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <Badge color="red" variant="light" size="sm">
                          {pctBad.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </Stack>
  );
}

function BurnRateChart({
  data,
  isLoading,
}: {
  data: any[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <LoadingOverlay visible={true} />;
  }

  if (!data || data.length === 0) {
    return (
      <Box
        h={300}
        display="flex"
        style={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <Text c="dimmed">No burn rate data available for this time range</Text>
      </Box>
    );
  }

  return (
    <Box h={300}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={val => format(new Date(val), 'MMM d HH:mm')}
            minTickGap={30}
          />
          <YAxis />
          <Tooltip
            labelFormatter={label => format(new Date(label), 'MMM d HH:mm:ss')}
            formatter={(value: number) => [
              `${value.toFixed(2)}x`,
              value >= 1
                ? `Burning ${value.toFixed(2)}x faster than expected`
                : 'Burning slower than expected',
            ]}
          />
          <ReferenceLine
            y={1.0}
            stroke="#868e96"
            strokeDasharray="3 3"
            label={{ value: 'Expected (1.0x)', position: 'insideTopRight' }}
          />
          <Area
            type="monotone"
            dataKey="burnRate"
            stroke="#fa5252"
            fill="#fa5252"
            fillOpacity={0.1}
            name="Burn Rate"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}

function SLODetailsPage() {
  const router = useRouter();
  const sloId = router.query.id as string;
  const confirm = useConfirm();

  const { data: slo, isLoading: isSLOLoading } = api.useSLO(sloId, {
    enabled: !!sloId,
  });

  const { data: status, isLoading: isStatusLoading } = api.useSLOStatus(sloId, {
    enabled: !!sloId,
  });

  const [displayedTimeInputValue, setDisplayedTimeInputValue] =
    useState('Past 24h');

  // Memoize initialTimeRange to prevent infinite loops - parseTimeQuery creates new Date objects
  const initialTimeRange = useMemo(
    () => parseTimeQuery('Past 24h', false) as [Date, Date],
    [],
  );

  const { searchedTimeRange, onSearch } = useNewTimeQuery({
    initialDisplayValue: 'Past 24h',
    initialTimeRange,
    setDisplayedTimeInputValue,
  });

  // Memoize the time range values for stable references in query keys
  const timeStart = useMemo(
    () => searchedTimeRange[0],
    [searchedTimeRange[0]?.getTime()],
  );
  const timeEnd = useMemo(
    () => searchedTimeRange[1],
    [searchedTimeRange[1]?.getTime()],
  );

  const { data: burnRateData, isLoading: isBurnRateLoading } =
    api.useSLOBurnRate(sloId, timeStart, timeEnd, {
      enabled: !!sloId,
    });

  const deleteSLO = api.useDeleteSLO();

  const handleDelete = async () => {
    if (
      await confirm(
        'Are you sure you want to delete this SLO? This action cannot be undone.',
        'Delete SLO',
      )
    ) {
      deleteSLO.mutate(sloId, {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: 'SLO deleted successfully',
          });
          router.push('/slos');
        },
        onError: () => {
          notifications.show({
            color: 'red',
            message: 'Failed to delete SLO',
          });
        },
      });
    }
  };

  if (isSLOLoading) {
    return <LoadingOverlay visible={true} />;
  }

  if (!slo) {
    return (
      <Container p="md">
        <Text>SLO not found</Text>
      </Container>
    );
  }

  return (
    <Container fluid p="md">
      <Head>
        <title>{slo.sloName} - SLO Details</title>
      </Head>

      <Button
        variant="subtle"
        leftSection={<IconArrowLeft size={16} />}
        onClick={() => router.push('/slos')}
        mb="md"
        color="gray"
      >
        Back to SLOs
      </Button>

      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>{slo.sloName}</Title>
          <Text c="dimmed">
            {slo.serviceName} • {slo.metricType}
          </Text>
        </div>
        <Group>
          <TimePicker
            inputValue={displayedTimeInputValue}
            setInputValue={setDisplayedTimeInputValue}
            onSearch={onSearch}
          />
          <Button
            variant="outline"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Group>
      </Group>

      <Grid gutter="md">
        <Grid.Col span={4}>
          <Stack>
            {status ? (
              <SLOStatusCard status={status} />
            ) : (
              <Card withBorder p="md">
                <LoadingOverlay visible={isStatusLoading} />
                <Text>Loading status...</Text>
              </Card>
            )}

            <Stack>
              <Card withBorder p="md" radius="md">
                <Title order={4} mb="md">
                  Configuration
                </Title>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Target
                    </Text>
                    <Text size="sm" fw={500}>
                      {slo.targetValue}%
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Time Window
                    </Text>
                    <Text size="sm" fw={500}>
                      {slo.timeWindow}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Metric Type
                    </Text>
                    <Badge variant="light">{slo.metricType}</Badge>
                  </Group>
                </Stack>
              </Card>

              <BurnAlertsConfig slo={slo} />
            </Stack>
          </Stack>
        </Grid.Col>

        <Grid.Col span={8}>
          <Card withBorder p="md" radius="md" h="100%">
            <Title order={4} mb="md">
              Burn Rate (Error Budget Consumption)
            </Title>
            <BurnRateChart data={burnRateData} isLoading={isBurnRateLoading} />
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder p="md" radius="md" mt="md">
        <Title order={4} mb="md">
          BubbleUp Analysis (Correlations)
        </Title>
        <Text c="dimmed" size="sm" mb="md">
          Comparing "Bad" vs "Good" events over the selected time range to find
          contributing factors.
        </Text>
        <BubbleUpAnalysis
          sloId={sloId}
          timeStart={timeStart}
          timeEnd={timeEnd}
        />
      </Card>
    </Container>
  );
}

function BurnAlertsConfig({ slo }: { slo: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const updateSLO = api.useUpdateSLO();
  const { data: webhooksData } = api.useWebhooks([
    WebhookService.Slack,
    WebhookService.Generic,
    WebhookService.IncidentIO,
  ]);

  const webhookOptions =
    webhooksData?.data?.map((w: any) => ({
      value: w._id,
      label: w.name,
    })) || [];

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { isDirty },
  } = useForm({
    defaultValues: {
      burnAlerts: slo.burnAlerts
        ? {
            enabled: slo.burnAlerts.enabled || false,
            thresholds:
              slo.burnAlerts.thresholds?.length > 0
                ? slo.burnAlerts.thresholds
                : [{ burnRate: 2.0, severity: 'warning' }],
            channel:
              slo.burnAlerts.channel?.webhookId || null,
          }
        : {
            enabled: false,
            thresholds: [{ burnRate: 2.0, severity: 'warning' }],
            channel: null,
          },
    },
  });

  const {
    fields: thresholdFields,
    append: appendThreshold,
    remove: removeThreshold,
  } = useFieldArray({
    control,
    name: 'burnAlerts.thresholds',
  });

  const burnAlertsEnabled = watch('burnAlerts.enabled');

  const onSubmit = async (data: any) => {
    try {
      const payload: any = {
        burnAlerts: data.burnAlerts.enabled
          ? {
              enabled: true,
              thresholds: data.burnAlerts.thresholds || [],
              channel: data.burnAlerts.channel
                ? {
                    type: 'webhook',
                    webhookId: data.burnAlerts.channel,
                  }
                : null,
            }
          : {
              enabled: false,
              thresholds: [],
              channel: null,
            },
      };

      await updateSLO.mutateAsync({ id: slo.id, ...payload });
      notifications.show({
        color: 'green',
        message: 'Burn alerts configuration updated',
      });
      setIsEditing(false);
    } catch (error: any) {
      notifications.show({
        color: 'red',
        message: error.message || 'Failed to update burn alerts',
      });
    }
  };

  const handleCancel = () => {
    reset();
    setIsEditing(false);
  };

  return (
    <Card withBorder p="md" radius="md">
      <Group justify="space-between" mb="md">
        <Title order={4}>Burn Alerts</Title>
        {!isEditing && (
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconEdit size={14} />}
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        )}
      </Group>

      {isEditing ? (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack gap="md">
            <Switch
              label="Enable Burn Rate Alerts"
              description="Get notified when error budget is being consumed faster than expected"
              {...register('burnAlerts.enabled')}
            />

            {burnAlertsEnabled && (
              <Paper p="md" withBorder>
                <Stack gap="md">
                  <Text size="sm" fw={500}>
                    Burn Rate Thresholds
                  </Text>
                  <Text size="xs" c="dimmed">
                    Alert when burn rate exceeds these thresholds. Burn rate of
                    1.0x = consuming budget evenly, 2.0x = consuming twice as
                    fast.
                  </Text>

                  {thresholdFields.map((field, index) => (
                    <Group key={field.id} align="flex-end" gap="xs">
                      <TextInput
                        label="Burn Rate"
                        placeholder="2.0"
                        type="number"
                        step="0.1"
                        min={0}
                        style={{ flex: 1 }}
                        {...register(
                          `burnAlerts.thresholds.${index}.burnRate` as const,
                          {
                            valueAsNumber: true,
                          },
                        )}
                      />
                      <Select
                        label="Severity"
                        data={[
                          { value: 'warning', label: 'Warning' },
                          { value: 'critical', label: 'Critical' },
                        ]}
                        style={{ width: 150 }}
                        {...register(
                          `burnAlerts.thresholds.${index}.severity` as const,
                        )}
                      />
                      {thresholdFields.length > 1 && (
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() => removeThreshold(index)}
                          mt="md"
                        >
                          <IconTrash size={14} />
                        </Button>
                      )}
                    </Group>
                  ))}

                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={() =>
                      appendThreshold({ burnRate: 2.0, severity: 'warning' })
                    }
                    style={{ width: 'fit-content' }}
                  >
                    Add Threshold
                  </Button>

                  <Select
                    label="Notification Webhook"
                    placeholder="Select a webhook"
                    description="Webhook to send burn alert notifications"
                    data={[
                      { value: '', label: 'None' },
                      ...webhookOptions,
                    ]}
                    value={watch('burnAlerts.channel') || ''}
                    onChange={value => setValue('burnAlerts.channel', value || null)}
                  />
                </Stack>
              </Paper>
            )}

            <Group justify="flex-end">
              <Button variant="subtle" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isDirty}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Status
            </Text>
            <Badge
              color={slo.burnAlerts?.enabled ? 'green' : 'gray'}
              variant="light"
            >
              {slo.burnAlerts?.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </Group>
          {slo.burnAlerts?.enabled && (
            <>
              <Divider />
              <Text size="sm" fw={500} mb="xs">
                Thresholds
              </Text>
              {slo.burnAlerts.thresholds?.map(
                (threshold: any, index: number) => (
                  <Group key={index} justify="space-between">
                    <Text size="sm" c="dimmed">
                      {threshold.burnRate}x - {threshold.severity}
                    </Text>
                    <Badge
                      color={
                        threshold.severity === 'critical' ? 'red' : 'yellow'
                      }
                      variant="light"
                      size="sm"
                    >
                      {threshold.severity}
                    </Badge>
                  </Group>
                ),
              )}
              {slo.burnAlerts.channel?.webhookId && (
                <>
                  <Divider />
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Webhook
                    </Text>
                    <Text size="sm" fw={500}>
                      {
                        webhookOptions.find(
                          (w: any) => w.value === slo.burnAlerts.channel.webhookId,
                        )?.label || 'Unknown'
                      }
                    </Text>
                  </Group>
                </>
              )}
            </>
          )}
        </Stack>
      )}
    </Card>
  );
}

export default SLODetailsPage;
