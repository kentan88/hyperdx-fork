import mongoose, { Schema } from 'mongoose';

import type { ObjectId } from '.';
import Service from './service';
import Team from './team';

export enum CheckType {
  HAS_OWNER = 'has_owner',
  HAS_RUNBOOK = 'has_runbook',
  HAS_REPO = 'has_repo',
  HAS_SLO = 'has_slo',
  HAS_LOGS = 'has_logs',
  HAS_TRACES = 'has_traces',
  // Future: HAS_ERR_MONITOR, HAS_LATENCY_MONITOR
}

export enum CheckStatus {
  PASS = 'pass',
  FAIL = 'fail',
}

export interface IServiceCheck {
  _id: ObjectId;
  service: ObjectId;
  team: ObjectId;
  checkType: CheckType | string;
  status: CheckStatus;
  message?: string;
  pillar?: string;
  checkWeight?: number;
  evidence?: any;
  updatedAt: Date;
}

export type ServiceCheckDocument = mongoose.HydratedDocument<IServiceCheck>;

const ServiceCheckSchema = new Schema<IServiceCheck>(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: Service.modelName,
      required: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: Team.modelName,
      required: true,
    },
    checkType: {
      type: String,
      // Allow arbitrary strings for custom checks, but keep enum for system checks
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(CheckStatus),
      required: true,
    },
    message: {
      type: String,
      required: false,
    },
    pillar: {
      type: String,
      required: false,
    },
    checkWeight: {
      type: Number,
      required: false,
      default: 1,
    },
    evidence: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying of a service's checks
ServiceCheckSchema.index({ service: 1, checkType: 1 }, { unique: true });

export default mongoose.model<IServiceCheck>('ServiceCheck', ServiceCheckSchema);

