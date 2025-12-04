import express from 'express';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import CloudProviderConnection, {
  CloudProvider,
  type ICloudProviderConnection,
} from '@/models/cloudProviderConnection';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import logger from '@/utils/logger';
import { AwsCollector } from '@/tasks/cloudMetricsCollector/awsCollector';
import { AzureCollector } from '@/tasks/cloudMetricsCollector/azureCollector';
import { GcpCollector } from '@/tasks/cloudMetricsCollector/gcpCollector';

const router = express.Router();

// Validation schemas
const cloudProviderConnectionSchema = z.object({
  provider: z.nativeEnum(CloudProvider),
  name: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  
  // AWS fields
  awsAccessKeyId: z.string().optional(),
  awsSecretAccessKey: z.string().optional(),
  awsRegion: z.string().optional(),
  awsRoleArn: z.string().optional(),
  
  // Azure fields
  azureClientId: z.string().optional(),
  azureClientSecret: z.string().optional(),
  azureTenantId: z.string().optional(),
  azureSubscriptionId: z.string().optional(),
  
  // GCP fields
  gcpProjectId: z.string().optional(),
  gcpServiceAccountKey: z.string().optional(),
  
  // Monitoring configuration
  pollingIntervalMinutes: z.number().min(1).max(1440).default(5),
  resourceTypes: z.array(z.string()).default([]),
  resourceTags: z.record(z.string()).optional(),
});

// GET /cloud-providers - List all cloud provider connections
router.get('/', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);

    const connections = await CloudProviderConnection.find({ team: teamId });

    // Don't return sensitive credentials
    res.json(connections.map(c => c.toJSON({ virtuals: true })));
  } catch (e) {
    next(e);
  }
});

// POST /cloud-providers - Create new connection
router.post(
  '/',
  validateRequest({
    body: cloudProviderConnectionSchema,
  }),
  async (req, res, next) => {
    try {
      const { teamId, userId } = getNonNullUserWithTeam(req);

      const connection = await CloudProviderConnection.create({
        ...req.body,
        team: teamId,
        createdBy: userId,
      });

      res.status(201).json({ id: connection._id.toString() });
    } catch (e) {
      next(e);
    }
  },
);

// PUT /cloud-providers/:id - Update connection
router.put(
  '/:id',
  validateRequest({
    body: cloudProviderConnectionSchema.partial(),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);

      const connection = await CloudProviderConnection.findOne({
        _id: req.params.id,
        team: teamId,
      }).select('+awsSecretAccessKey +azureClientSecret +gcpServiceAccountKey');

      if (!connection) {
        res.status(404).send('Connection not found');
        return;
      }

      // Preserve existing secrets if not provided
      const updates: any = { ...req.body };
      
      if (!req.body.awsSecretAccessKey && connection.awsSecretAccessKey) {
        updates.awsSecretAccessKey = connection.awsSecretAccessKey;
      }
      if (!req.body.azureClientSecret && connection.azureClientSecret) {
        updates.azureClientSecret = connection.azureClientSecret;
      }
      if (!req.body.gcpServiceAccountKey && connection.gcpServiceAccountKey) {
        updates.gcpServiceAccountKey = connection.gcpServiceAccountKey;
      }

      const updatedConnection = await CloudProviderConnection.findOneAndUpdate(
        { _id: req.params.id, team: teamId },
        updates,
        { new: true },
      );

      if (!updatedConnection) {
        res.status(404).send('Connection not found');
        return;
      }

      res.status(200).send();
    } catch (e) {
      next(e);
    }
  },
);

// DELETE /cloud-providers/:id - Delete connection
router.delete('/:id', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);

    await CloudProviderConnection.findOneAndDelete({
      _id: req.params.id,
      team: teamId,
    });

    res.status(200).send();
  } catch (e) {
    next(e);
  }
});

// POST /cloud-providers/:id/test - Test connection credentials
router.post('/:id/test', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);

    const connection = await CloudProviderConnection.findOne({
      _id: req.params.id,
      team: teamId,
    }).select('+awsSecretAccessKey +azureClientSecret +gcpServiceAccountKey');

    if (!connection) {
      res.status(404).send('Connection not found');
      return;
    }

    // Test the connection based on provider
    let collector;
    switch (connection.provider) {
      case CloudProvider.AWS:
        collector = new AwsCollector();
        break;
      case CloudProvider.AZURE:
        collector = new AzureCollector();
        break;
      case CloudProvider.GCP:
        collector = new GcpCollector();
        break;
      default:
        res.status(400).send('Unknown provider');
        return;
    }

    const success = await collector.testConnection(connection);

    res.json({ success });
  } catch (e) {
    logger.error({ error: e }, 'Error testing cloud provider connection');
    next(e);
  }
});

// POST /cloud-providers/:id/sync - Trigger immediate sync
router.post('/:id/sync', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);

    const connection = await CloudProviderConnection.findOne({
      _id: req.params.id,
      team: teamId,
    });

    if (!connection) {
      res.status(404).send('Connection not found');
      return;
    }

    // Trigger background task for this specific connection
    // This would normally be done via a queue or direct task execution
    // For now, return accepted status - actual sync happens via cron
    res.status(202).json({ 
      message: 'Sync requested',
      connectionId: connection.id 
    });
  } catch (e) {
    next(e);
  }
});

export default router;
