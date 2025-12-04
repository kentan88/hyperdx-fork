import {
  Button,
  Group,
  MultiSelect,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import type { CreateCloudProviderConnection } from '../hooks/useCloudProviders';

interface CloudProviderFormProps {
  initialValues?: Partial<CreateCloudProviderConnection>;
  onSubmit: (data: CreateCloudProviderConnection) => void;
  onCancel: () => void;
  isEdit?: boolean;
}

const AWS_RESOURCE_OPTIONS = [
  { value: 'ec2', label: 'EC2 Instances' },
  { value: 'rds', label: 'RDS Databases' },
  { value: 'elb', label: 'Load Balancers (ELB/ALB)' },
  { value: 'lambda', label: 'Lambda Functions' },
  { value: 'dynamodb', label: 'DynamoDB Tables' },
  { value: 's3', label: 'S3 Buckets' },
];

const AZURE_RESOURCE_OPTIONS = [
  { value: 'vm', label: 'Virtual Machines' },
  { value: 'sqldb', label: 'SQL Databases' },
  { value: 'storage', label: 'Storage Accounts' },
];

const GCP_RESOURCE_OPTIONS = [
  { value: 'compute', label: 'Compute Engine' },
  { value: 'cloudsql', label: 'Cloud SQL' },
  { value: 'storage', label: 'Cloud Storage' },
];

export default function CloudProviderForm({
  initialValues,
  onSubmit,
  onCancel,
  isEdit = false,
}: CloudProviderFormProps) {
  const [awsAuthMethod, setAwsAuthMethod] = useState<'credentials' | 'role'>(
    initialValues?.awsRoleArn ? 'role' : 'credentials'
  );
  
  const form = useForm<CreateCloudProviderConnection>({
    initialValues: {
      provider: initialValues?.provider || 'aws',
      name: initialValues?.name || '',
      enabled: initialValues?.enabled ?? true,
      
      // AWS
      awsAccessKeyId: initialValues?.awsAccessKeyId || '',
      awsSecretAccessKey: '',
      awsRegion: initialValues?.awsRegion || 'us-east-1',
      awsRoleArn: initialValues?.awsRoleArn || '',
      
      // Azure
      azureClientId: initialValues?.azureClientId || '',
      azureClientSecret: '',
      azureTenantId: initialValues?.azureTenantId || '',
      azureSubscriptionId: initialValues?.azureSubscriptionId || '',
      
      // GCP
      gcpProjectId: initialValues?.gcpProjectId || '',
      gcpServiceAccountKey: '',
      
      // Config
      pollingIntervalMinutes: initialValues?.pollingIntervalMinutes || 5,
      resourceTypes: initialValues?.resourceTypes || [],
    },
    validate: {
      name: (value) => (value.length > 0 ? null : 'Name is required'),
      awsAccessKeyId: (value, values) =>
        values.provider === 'aws' && awsAuthMethod === 'credentials' && !value
          ? 'Access Key ID is required'
          : null,
      awsSecretAccessKey: (value, values) =>
        values.provider === 'aws' && awsAuthMethod === 'credentials' && !isEdit && !value
          ? 'Secret Access Key is required'
          : null,
      awsRegion: (value, values) =>
        values.provider === 'aws' && !value ? 'Region is required' : null,
      awsRoleArn: (value, values) =>
        values.provider === 'aws' && awsAuthMethod === 'role' && !value
          ? 'Role ARN is required'
          : null,
      azureClientId: (value, values) =>
        values.provider === 'azure' && !value ? 'Client ID is required' : null,
      azureClientSecret: (value, values) =>
        values.provider === 'azure' && !isEdit && !value
          ? 'Client Secret is required'
          : null,
      azureTenantId: (value, values) =>
        values.provider === 'azure' && !value ? 'Tenant ID is required' : null,
      azureSubscriptionId: (value, values) =>
        values.provider === 'azure' && !value
          ? 'Subscription ID is required'
          : null,
      gcpProjectId: (value, values) =>
        values.provider === 'gcp' && !value ? 'Project ID is required' : null,
      gcpServiceAccountKey: (value, values) =>
        values.provider === 'gcp' && !isEdit && !value
          ? 'Service Account Key is required'
          : null,
    },
  });

  const provider = form.values.provider;

  const resourceOptions =
    provider === 'aws'
      ? AWS_RESOURCE_OPTIONS
      : provider === 'azure'
        ? AZURE_RESOURCE_OPTIONS
        : GCP_RESOURCE_OPTIONS;

  const handleSubmit = (values: CreateCloudProviderConnection) => {
    // Clear fields based on auth method for AWS
    if (values.provider === 'aws') {
      if (awsAuthMethod === 'role') {
        values.awsAccessKeyId = undefined;
        values.awsSecretAccessKey = undefined;
      } else {
        values.awsRoleArn = undefined;
      }
    }
    
    onSubmit(values);
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack spacing="md">
        <Select
          label="Provider"
          placeholder="Select cloud provider"
          data={[
            { value: 'aws', label: 'AWS' },
            { value: 'azure', label: 'Azure' },
            { value: 'gcp', label: 'Google Cloud Platform' },
          ]}
          {...form.getInputProps('provider')}
          disabled={isEdit}
        />

        <TextInput
          label="Connection Name"
          placeholder="Production AWS"
          required
          {...form.getInputProps('name')}
        />

        <Switch
          label="Enabled"
          description="Enable automatic metrics collection"
          {...form.getInputProps('enabled', { type: 'checkbox' })}
        />

        {/* AWS Configuration */}
        {provider === 'aws' && (
          <>
            <Text size="sm" weight={600} mt="md">
              AWS Configuration
            </Text>

            <Tabs value={awsAuthMethod} onChange={(val) => setAwsAuthMethod(val as 'credentials' | 'role')}>
              <Tabs.List>
                <Tabs.Tab value="credentials">IAM Credentials</Tabs.Tab>
                <Tabs.Tab value="role">IAM Role ARN</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="credentials" pt="md">
                <Stack spacing="md">
                  <TextInput
                    label="Access Key ID"
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    required
                    {...form.getInputProps('awsAccessKeyId')}
                  />

                  <PasswordInput
                    label="Secret Access Key"
                    placeholder={isEdit ? '••••••••' : 'Your AWS secret access key'}
                    description={
                      isEdit
                        ? 'Leave blank to keep existing credentials'
                        : 'Your AWS secret access key'
                    }
                    required={!isEdit}
                    {...form.getInputProps('awsSecretAccessKey')}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="role" pt="md">
                <TextInput
                  label="IAM Role ARN"
                  placeholder="arn:aws:iam::123456789012:role/HyperDXMonitoring"
                  description="If provided, will assume this role instead of using access keys"
                  required
                  {...form.getInputProps('awsRoleArn')}
                />
              </Tabs.Panel>
            </Tabs>

            <Select
              label="AWS Region"
              placeholder="Select a region"
              searchable
              data={[
                { value: 'us-east-1', label: 'US East (N. Virginia)' },
                { value: 'us-east-2', label: 'US East (Ohio)' },
                { value: 'us-west-1', label: 'US West (N. California)' },
                { value: 'us-west-2', label: 'US West (Oregon)' },
                { value: 'af-south-1', label: 'Africa (Cape Town)' },
                { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
                { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
                { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
                { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
                { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
                { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
                { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
                { value: 'ca-central-1', label: 'Canada (Central)' },
                { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
                { value: 'eu-west-1', label: 'Europe (Ireland)' },
                { value: 'eu-west-2', label: 'Europe (London)' },
                { value: 'eu-south-1', label: 'Europe (Milan)' },
                { value: 'eu-west-3', label: 'Europe (Paris)' },
                { value: 'eu-north-1', label: 'Europe (Stockholm)' },
                { value: 'me-south-1', label: 'Middle East (Bahrain)' },
                { value: 'sa-east-1', label: 'South America (São Paulo)' },
              ]}
              required
              {...form.getInputProps('awsRegion')}
            />
          </>
        )}

        {/* Azure Configuration */}
        {provider === 'azure' && (
          <>
            <Text size="sm" weight={600} mt="md">
              Azure Configuration
            </Text>

            <TextInput
              label="Client ID"
              placeholder="00000000-0000-0000-0000-000000000000"
              required
              {...form.getInputProps('azureClientId')}
            />

            <PasswordInput
              label="Client Secret"
              placeholder={isEdit ? '••••••••' : 'Your Azure client secret'}
              description={
                isEdit
                  ? 'Leave blank to keep existing credentials'
                  : 'Your Azure service principal client secret'
              }
              required={!isEdit}
              {...form.getInputProps('azureClientSecret')}
            />

            <TextInput
              label="Tenant ID"
              placeholder="00000000-0000-0000-0000-000000000000"
              required
              {...form.getInputProps('azureTenantId')}
            />

            <TextInput
              label="Subscription ID"
              placeholder="00000000-0000-0000-0000-000000000000"
              required
              {...form.getInputProps('azureSubscriptionId')}
            />
          </>
        )}

        {/* GCP Configuration */}
        {provider === 'gcp' && (
          <>
            <Text size="sm" weight={600} mt="md">
              Google Cloud Configuration
            </Text>

            <TextInput
              label="Project ID"
              placeholder="my-project-123456"
              required
              {...form.getInputProps('gcpProjectId')}
            />

            <PasswordInput
              label="Service Account Key (JSON)"
              placeholder={isEdit ? '••••••••' : 'Paste your service account JSON key'}
              description={
                isEdit
                  ? 'Leave blank to keep existing credentials'
                  : 'Paste the contents of your GCP service account JSON key file'
              }
              required={!isEdit}
              {...form.getInputProps('gcpServiceAccountKey')}
            />
          </>
        )}

        <Text size="sm" weight={600} mt="md">
          Monitoring Configuration
        </Text>

        <MultiSelect
          label="Resource Types"
          placeholder="Select resource types to monitor"
          data={resourceOptions}
          {...form.getInputProps('resourceTypes')}
        />

        <NumberInput
          label="Polling Interval (minutes)"
          placeholder="5"
          min={1}
          max={1440}
          {...form.getInputProps('pollingIntervalMinutes')}
        />

        <Group position="right" mt="xl">
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{isEdit ? 'Update' : 'Create'} Connection</Button>
        </Group>
      </Stack>
    </form>
  );
}
