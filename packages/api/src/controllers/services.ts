import mongoose from 'mongoose';

import Service, { IService, ServiceTier } from '@/models/service';
import ServiceCheck, { CheckStatus, IServiceCheck } from '@/models/serviceCheck';
import { ObjectId } from '@/models';
import { calculateServiceScore } from '@/services/scorecard';

export async function getServices(teamId: string): Promise<IService[]> {
  return Service.find({ team: teamId }).sort({ name: 1 });
}

export async function getService(teamId: string, name: string): Promise<IService | null> {
  return Service.findOne({ team: teamId, name });
}

export async function getServiceChecks(teamId: string, name: string): Promise<IServiceCheck[]> {
  const service = await Service.findOne({ team: teamId, name });
  if (!service) {
    return [];
  }
  return ServiceCheck.find({ service: service._id });
}

export async function updateService(
  teamId: string,
  name: string,
  updates: Partial<Pick<IService, 'description' | 'owner' | 'tier' | 'runbookUrl' | 'repoUrl'>>
): Promise<IService | null> {
  return Service.findOneAndUpdate(
    { team: teamId, name },
    { $set: updates },
    { new: true }
  );
}

export async function reportServiceCheck(
  teamId: string,
  serviceName: string,
  check: {
    checkType: string;
    status: CheckStatus;
    message?: string;
    pillar?: string;
    checkWeight?: number;
    evidence?: any;
  }
): Promise<IServiceCheck | null> {
  const service = await Service.findOne({ team: teamId, name: serviceName });
  if (!service) {
    return null;
  }

  const result = await ServiceCheck.findOneAndUpdate(
    { service: service._id, checkType: check.checkType },
    {
      $set: {
        team: teamId,
        status: check.status,
        message: check.message,
        pillar: check.pillar,
        checkWeight: check.checkWeight,
        evidence: check.evidence,
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // Recalculate score asynchronously (or await if critical)
  await calculateServiceScore(service._id, new mongoose.Types.ObjectId(teamId));

  return result;
}
