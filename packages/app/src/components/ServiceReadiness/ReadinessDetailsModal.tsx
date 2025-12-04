import React from 'react';
import { Accordion, Badge, Code, Group, Modal, Stack, Table, Text, ThemeIcon } from '@mantine/core';
import { IconCheck, IconX, IconInfoCircle } from '@tabler/icons-react';

import api from '@/api';
import { CheckStatus, CheckType, Service } from '@/types';

interface ReadinessDetailsModalProps {
  opened: boolean;
  onClose: () => void;
  service: Service;
}

const CHECK_LABELS: Record<string, string> = {
  [CheckType.HAS_OWNER]: 'Owner Assigned',
  [CheckType.HAS_RUNBOOK]: 'Runbook URL',
  [CheckType.HAS_REPO]: 'Repository URL',
  [CheckType.HAS_SLO]: 'SLOs Defined',
  [CheckType.HAS_LOGS]: 'Logs Detected (24h)',
  [CheckType.HAS_TRACES]: 'Traces Detected (24h)',
};

const PILLARS: Record<string, string> = {
  telemetry: 'Telemetry',
  reliability: 'Reliability',
  ownership: 'Ownership',
  documentation: 'Documentation',
  other: 'Other',
};

export const ReadinessDetailsModal = ({ opened, onClose, service }: ReadinessDetailsModalProps) => {
  const { data: checks, isLoading } = api.useServiceChecks(service.name);

  // Group checks by pillar
  const checksByPillar = React.useMemo(() => {
    if (!checks) return {};
    const groups: Record<string, typeof checks> = {};
    
    checks.forEach(check => {
      const pillar = check.pillar || 'other';
      if (!groups[pillar]) groups[pillar] = [];
      groups[pillar].push(check);
    });
    
    return groups;
  }, [checks]);

  const sortedPillars = ['telemetry', 'reliability', 'ownership', 'documentation', 'other'].filter(p => checksByPillar[p]?.length);

  return (
    <Modal opened={opened} onClose={onClose} title={<Group><Text fw={700}>Readiness Scorecard: {service.name}</Text><Badge size="lg" color={service.score && service.score >= 90 ? 'green' : service.score && service.score >= 70 ? 'blue' : 'orange'}>{service.score ?? 0}%</Badge></Group>} size="xl">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Readiness checks run periodically to audit service maturity. Improve your score by fixing the failing checks below.
        </Text>

        {isLoading ? (
          <Text>Loading checks...</Text>
        ) : (
          <Accordion multiple defaultValue={sortedPillars} variant="separated">
            {sortedPillars.map(pillarKey => (
              <Accordion.Item key={pillarKey} value={pillarKey}>
                <Accordion.Control>
                  <Group>
                    <Text fw={600}>{PILLARS[pillarKey] || pillarKey}</Text>
                    <Badge variant="light" color="gray">{checksByPillar[pillarKey].length} Checks</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Check</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Evidence / Message</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {checksByPillar[pillarKey].map((check) => (
                        <Table.Tr key={check.checkType}>
                          <Table.Td>
                            <Text size="sm" fw={500}>{CHECK_LABELS[check.checkType] || check.checkType}</Text>
                            <Text size="xs" c="dimmed">Weight: {check.checkWeight || 1}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge 
                              color={check.status === CheckStatus.PASS ? 'green' : 'red'} 
                              variant="light"
                              leftSection={check.status === CheckStatus.PASS ? <IconCheck size={12} /> : <IconX size={12} />}
                            >
                              {check.status === CheckStatus.PASS ? 'PASS' : 'FAIL'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap="xs">
                              {check.message && (
                                <Text size="sm" c={check.status === CheckStatus.FAIL ? 'red' : 'dimmed'}>
                                  {check.message}
                                </Text>
                              )}
                              {check.evidence && (
                                <Code block fz="xs" c="dimmed">
                                  {JSON.stringify(check.evidence, null, 2)}
                                </Code>
                              )}
                            </Stack>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Stack>
    </Modal>
  );
};
