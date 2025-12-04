import mongoose, { Schema } from 'mongoose';
import type { ObjectId } from '.';

export enum CloudProvider {
  AWS = 'aws',
  AZURE = 'azure',
  GCP = 'gcp',
}

export enum CloudSyncStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  PENDING = 'pending',
}

export interface ICloudProviderConnection {
  _id: ObjectId;
  id: string;
  team: ObjectId;
  provider: CloudProvider;
  name: string;
  enabled: boolean;

  // AWS credentials
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string; // encrypted, select: false
  awsRegion?: string;
  awsRoleArn?: string; // for assume role

  // Azure credentials
  azureClientId?: string;
  azureClientSecret?: string; // encrypted, select: false
  azureTenantId?: string;
  azureSubscriptionId?: string;

  // GCP credentials
  gcpProjectId?: string;
  gcpServiceAccountKey?: string; // encrypted JSON key, select: false

  // Monitoring configuration
  pollingIntervalMinutes: number; // default: 5
  resourceTypes: string[]; // e.g., ['ec2', 'rds', 'elb']
  resourceTags?: Record<string, string>; // filter resources by tags

  // Metadata
  createdBy: ObjectId;
  lastSyncAt?: Date;
  lastSyncStatus?: CloudSyncStatus;
  lastSyncError?: string;
}

export type CloudProviderConnectionDocument =
  mongoose.HydratedDocument<ICloudProviderConnection>;

const CloudProviderConnectionSchema = new Schema<ICloudProviderConnection>(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Team',
    },
    provider: {
      type: String,
      enum: Object.values(CloudProvider),
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },

    // AWS credentials
    awsAccessKeyId: String,
    awsSecretAccessKey: {
      type: String,
      select: false,
    },
    awsRegion: String,
    awsRoleArn: String,

    // Azure credentials
    azureClientId: String,
    azureClientSecret: {
      type: String,
      select: false,
    },
    azureTenantId: String,
    azureSubscriptionId: String,

    // GCP credentials
    gcpProjectId: String,
    gcpServiceAccountKey: {
      type: String,
      select: false,
    },

    // Monitoring configuration
    pollingIntervalMinutes: {
      type: Number,
      default: 5,
    },
    resourceTypes: {
      type: [String],
      default: [],
    },
    resourceTags: {
      type: Map,
      of: String,
    },

    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastSyncAt: Date,
    lastSyncStatus: {
      type: String,
      enum: Object.values(CloudSyncStatus),
    },
    lastSyncError: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// Index for efficient queries
CloudProviderConnectionSchema.index({ team: 1, provider: 1 });
CloudProviderConnectionSchema.index({ enabled: 1 });

export default mongoose.model<ICloudProviderConnection>(
  'CloudProviderConnection',
  CloudProviderConnectionSchema,
);
