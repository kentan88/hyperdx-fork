import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCloud,
  IconDots,
  IconEdit,
  IconRefresh,
  IconTestPipe,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import Head from 'next/head';

import { PageHeader } from '@/components/PageHeader';
import CloudProviderForm from '../src/components/CloudProviderForm';
import {
  type CloudProviderConnection,
  type CreateCloudProviderConnection,
  useCloudProviderConnections,
  useCreateCloudProvider,
  useDeleteCloudProvider,
  useSyncCloudProvider,
  useTestCloudProvider,
  useUpdateCloudProvider,
} from '../src/hooks/useCloudProviders';
import { withAppNav } from '../src/layout';

function CloudProvidersPage() {
  const [isCreateModalOpen, { open: openCreateModal, close: closeCreateModal }] =
    useDisclosure(false);
  const [editingConnection, setEditingConnection] =
    useState<CloudProviderConnection | null>(null);

  const { data: connections, isLoading } = useCloudProviderConnections();
  const createMutation = useCreateCloudProvider();
  const updateMutation = useUpdateCloudProvider();
  const deleteMutation = useDeleteCloudProvider();
  const testMutation = useTestCloudProvider();
  const syncMutation = useSyncCloudProvider();

  const handleCreate = async (data: CreateCloudProviderConnection) => {
    await createMutation.mutateAsync(data);
    closeCreateModal();
    notifications.show({
      title: 'Success',
      message: 'Cloud provider connection created successfully',
      color: 'green',
    });
  };

  const handleUpdate = async (data: CreateCloudProviderConnection) => {
    if (!editingConnection) return;
    
    // Remove empty string values to preserve existing credentials
    const cleanedData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== '')
    ) as Partial<CreateCloudProviderConnection>;
    
    await updateMutation.mutateAsync({
      id: editingConnection.id,
      data: cleanedData,
    });
    setEditingConnection(null);
    notifications.show({
      title: 'Success',
      message: 'Cloud provider connection updated successfully',
      color: 'green',
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      await deleteMutation.mutateAsync(id);
      notifications.show({
        title: 'Success',
        message: 'Cloud provider connection deleted',
        color: 'green',
      });
    }
  };

  const handleTest = async (id: string, name: string) => {
    try {
      const result = await testMutation.mutateAsync(id);
      if (result.success) {
        notifications.show({
          title: 'Connection Successful',
          message: `Successfully connected to ${name}`,
          color: 'green',
        });
      } else {
        notifications.show({
          title: 'Connection Failed',
          message: `Failed to connect to ${name}`,
          color: 'red',
        });
      }
    } catch (error: any) {
      notifications.show({
        title: 'Connection Failed',
        message: error.message || 'Failed to test connection',
        color: 'red',
      });
    }
  };

  const handleSync = async (id: string, name: string) => {
    try {
      await syncMutation.mutateAsync(id);
      notifications.show({
        title: 'Sync Requested',
        message: `Metrics collection triggered for ${name}`,
        color: 'blue',
      });
    } catch (error: any) {
      notifications.show({
        title: 'Sync Failed',
        message: error.message || 'Failed to trigger sync',
        color: 'red',
      });
    }
  };

  const getProviderBadgeColor = (provider: string) => {
    switch (provider) {
      case 'aws':
        return 'orange';
      case 'azure':
        return 'blue';
      case 'gcp':
        return 'green';
      default:
        return 'gray';
    }
  };

  const getStatusBadge = (connection: CloudProviderConnection) => {
    if (!connection.enabled) {
      return <Badge color="gray">Disabled</Badge>;
    }
    
    if (!connection.lastSyncAt) {
      return <Badge color="yellow">Pending First Sync</Badge>;
    }
    
    switch (connection.lastSyncStatus) {
      case 'success':
        return <Badge color="green">Active</Badge>;
      case 'error':
        return (
          <Tooltip label={connection.lastSyncError || 'Unknown error'}>
            <Badge color="red">Error</Badge>
          </Tooltip>
        );
      case 'pending':
        return <Badge color="blue">Syncing</Badge>;
      default:
        return <Badge color="gray">Unknown</Badge>;
    }
  };

  return (
    <div className="CloudProvidersPage">
      <Head>
        <title>Cloud Providers - HyperDX</title>
      </Head>
      
      <PageHeader>
        <Group position="apart" w="100%">
          <div>
            <Group spacing="sm">
              <IconCloud size={24} />
              <div>Cloud Providers</div>
            </Group>
          </div>
          <Button
            leftIcon={<IconCloud size={18} />}
            onClick={openCreateModal}
          >
            Add Cloud Provider
          </Button>
        </Group>
      </PageHeader>
      
      <div className="my-4">
        <Container maw={1500}>
          {isLoading ? (
            <Text>Loading...</Text>
          ) : !connections || connections.length === 0 ? (
            <Card shadow="sm" p="xl" radius="md" withBorder>
              <Stack align="center" spacing="md" py="xl">
                <IconCloud size={64} stroke={1} color="gray" />
                <Text size="lg" weight={600}>No Cloud Providers Configured</Text>
                <Text color="dimmed" align="center" size="sm">
                  Get started by connecting your first cloud provider to monitor
                  infrastructure metrics across AWS, Azure, or GCP.
                </Text>
                <Button
                  leftIcon={<IconCloud size={18} />}
                  onClick={openCreateModal}
                  mt="md"
                >
                  Add Cloud Provider
                </Button>
              </Stack>
            </Card>
          ) : (
            <Card shadow="sm" p="md" radius="md" withBorder>
              <Table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Resource Types</th>
                    <th>Last Sync</th>
                    <th>Poll Interval</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map(connection => (
                    <tr key={connection.id}>
                      <td>
                        <Badge color={getProviderBadgeColor(connection.provider)}>
                          {connection.provider.toUpperCase()}
                        </Badge>
                      </td>
                      <td>
                        <Text weight={500}>{connection.name}</Text>
                      </td>
                      <td>{getStatusBadge(connection)}</td>
                      <td>
                        <Text size="sm" color="dimmed">
                          {connection.resourceTypes.length > 0
                            ? connection.resourceTypes.join(', ')
                            : 'None'}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm" color="dimmed">
                          {connection.lastSyncAt
                            ? new Date(connection.lastSyncAt).toLocaleString()
                            : 'Never'}
                        </Text>
                      </td>
                      <td>
                        <Text size="sm" color="dimmed">
                          {connection.pollingIntervalMinutes} min
                        </Text>
                      </td>
                      <td>
                        <Menu position="bottom-end" shadow="md">
                          <Menu.Target>
                            <ActionIcon>
                              <IconDots size={16} />
                            </ActionIcon>
                          </Menu.Target>

                          <Menu.Dropdown>
                            <Menu.Item
                              icon={<IconTestPipe size={14} />}
                              onClick={() =>
                                handleTest(connection.id, connection.name)
                              }
                            >
                              Test Connection
                            </Menu.Item>
                            <Menu.Item
                              icon={<IconRefresh size={14} />}
                              onClick={() =>
                                handleSync(connection.id, connection.name)
                              }
                            >
                              Sync Now
                            </Menu.Item>
                            <Menu.Item
                              icon={<IconEdit size={14} />}
                              onClick={() => setEditingConnection(connection)}
                            >
                              Edit
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item
                              icon={<IconTrash size={14} />}
                              color="red"
                              onClick={() =>
                                handleDelete(connection.id, connection.name)
                              }
                            >
                              Delete
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </Container>
      </div>

      {/* Create Modal */}
      <Modal
        opened={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Add Cloud Provider"
        size="lg"
      >
        <CloudProviderForm onSubmit={handleCreate} onCancel={closeCreateModal} />
      </Modal>

      {/* Edit Modal */}
      <Modal
        opened={!!editingConnection}
        onClose={() => setEditingConnection(null)}
        title="Edit Cloud Provider"
        size="lg"
      >
        {editingConnection && (
          <CloudProviderForm
            initialValues={editingConnection}
            onSubmit={handleUpdate}
            onCancel={() => setEditingConnection(null)}
            isEdit
          />
        )}
      </Modal>
    </div>
  );
}

CloudProvidersPage.getLayout = withAppNav;

export default CloudProvidersPage;
