import React, { useEffect } from 'react';
import { Button, Group, Modal, NumberInput, Stack, Text, TextInput, ActionIcon } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import api from '@/api';
import { notifications } from '@mantine/notifications';

interface ScorecardSettingsModalProps {
  opened: boolean;
  onClose: () => void;
}

export const ScorecardSettingsModal = ({ opened, onClose }: ScorecardSettingsModalProps) => {
  const { data: scorecard, isLoading } = api.useScorecard({ enabled: opened });
  const updateScorecard = api.useUpdateScorecard();

  const form = useForm({
    initialValues: {
      pillars: [] as { key: string; label: string; weight: number }[],
    },
  });

  useEffect(() => {
    if (scorecard && scorecard.pillars) {
      form.setValues({
        pillars: scorecard.pillars,
      });
    } else if (scorecard && !scorecard.pillars && opened) {
      // Defaults if new
      form.setValues({
        pillars: [
          { key: 'telemetry', label: 'Telemetry', weight: 35 },
          { key: 'reliability', label: 'Reliability', weight: 35 },
          { key: 'ownership', label: 'Ownership', weight: 15 },
          { key: 'documentation', label: 'Documentation', weight: 15 },
        ]
      });
    }
  }, [scorecard, opened]);

  const handleSubmit = async (values: typeof form.values) => {
    try {
      const totalWeight = values.pillars.reduce((sum, p) => sum + p.weight, 0);
      if (totalWeight !== 100) {
        notifications.show({
          title: 'Warning',
          message: `Total weight is ${totalWeight}%, it is recommended to sum to 100%.`,
          color: 'orange',
        });
      }

      await updateScorecard.mutateAsync(values);
      notifications.show({
        title: 'Success',
        message: 'Scorecard settings updated',
        color: 'green',
      });
      onClose();
    } catch (e) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update scorecard settings',
        color: 'red',
      });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Scorecard Configuration" size="lg">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Define the pillars of your service readiness scorecard and their relative weights.
          </Text>

          <Stack gap="xs">
             <Group grow>
                <Text size="xs" fw={700}>Label</Text>
                <Text size="xs" fw={700}>Key</Text>
                <Text size="xs" fw={700}>Weight (%)</Text>
                <div style={{ width: 30 }} />
             </Group>
            {form.values.pillars.map((item, index) => (
              <Group key={index} grow>
                <TextInput
                  placeholder="e.g. Telemetry"
                  required
                  {...form.getInputProps(`pillars.${index}.label`)}
                />
                <TextInput
                  placeholder="e.g. telemetry"
                  required
                  {...form.getInputProps(`pillars.${index}.key`)}
                />
                <NumberInput
                  placeholder="25"
                  required
                  min={0}
                  max={100}
                  {...form.getInputProps(`pillars.${index}.weight`)}
                />
                <ActionIcon color="red" variant="subtle" onClick={() => form.removeListItem('pillars', index)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>

          <Button variant="outline" leftSection={<IconPlus size={16} />} onClick={() => form.insertListItem('pillars', { key: '', label: '', weight: 0 })}>
            Add Pillar
          </Button>

          <Group justify="flex-end" mt="md">
             <Button variant="default" onClick={onClose}>Cancel</Button>
             <Button type="submit" loading={updateScorecard.isPending}>Save Changes</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

