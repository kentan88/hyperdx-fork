import mongoose from 'mongoose';

import * as config from '@/config';
import logger from '@/utils/logger';

export type ObjectId = mongoose.Types.ObjectId;

// set flags
mongoose.set('strictQuery', false);

// Allow empty strings to be set to required fields
// https://github.com/Automattic/mongoose/issues/7150
// ex. query in logview can be empty
mongoose.Schema.Types.String.checkRequired(v => v != null);

// connection events handlers
mongoose.connection.on('connected', () => {
  logger.info('Connection established to MongoDB');
});

mongoose.connection.on('disconnected', () => {
  logger.info('Lost connection to MongoDB server');
});

mongoose.connection.on('error', err => {
  logger.error({ err }, 'Could not connect to MongoDB');
});

mongoose.connection.on('reconnected', () => {
  logger.warn('Reconnected to MongoDB');
});

mongoose.connection.on('reconnectFailed', () => {
  logger.error('Failed to reconnect to MongoDB');
});

export const connectDB = async () => {
  if (config.MONGO_URI == null) {
    throw new Error('MONGO_URI is not set');
  }
  await mongoose.connect(config.MONGO_URI, {
    heartbeatFrequencyMS: 10000, // retry failed heartbeats
    maxPoolSize: 100, // 5 nodes -> max 1000 connections
  });
};

export const mongooseConnection = mongoose.connection;

export { default as Alert } from './alert';
export { default as AlertHistory } from './alertHistory';
export { Anomaly } from './anomaly';
export { default as CloudProviderConnection } from './cloudProviderConnection';
export { default as Connection } from './connection';
export { default as Dashboard } from './dashboard';
export { default as Incident } from './incident';
export { SavedSearch } from './savedSearch';
export { default as Service } from './service';
export { default as ServiceCheck } from './serviceCheck';
export { default as SLO } from './slo';
export { Source, type ISource } from './source';
export { default as Team } from './team';
export { default as TeamInvite } from './teamInvite';
export { default as UptimeCheckHistory } from './uptimeCheckHistory';
export { default as UptimeMonitor } from './uptimeMonitor';
export { default as User } from './user';
export { default as Webhook } from './webhook';
