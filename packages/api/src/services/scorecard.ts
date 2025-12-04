import Service, { ServiceReadiness } from '@/models/service';
import ServiceCheck, { CheckStatus } from '@/models/serviceCheck';
import Scorecard, { IScorecardColumn, IScorecardRule } from '@/models/scorecard';
import { ObjectId } from 'mongoose';

const DEFAULT_PILLARS: IScorecardColumn[] = [
  { key: 'telemetry', label: 'Telemetry', weight: 35 },
  { key: 'reliability', label: 'Reliability', weight: 35 },
  { key: 'ownership', label: 'Ownership', weight: 15 },
  { key: 'documentation', label: 'Documentation', weight: 15 },
];

const DEFAULT_RULES: IScorecardRule[] = [
  // These are system defaults, but user can override
];

export async function getScorecardForTeam(teamId: ObjectId) {
  let scorecard = await Scorecard.findOne({ team: teamId });
  if (!scorecard) {
    // Return defaults without persisting if preferred, or persist
    return {
      pillars: DEFAULT_PILLARS,
      rules: DEFAULT_RULES,
    };
  }
  return scorecard;
}

export async function calculateServiceScore(serviceId: ObjectId, teamId: ObjectId) {
  const scorecard = await getScorecardForTeam(teamId);
  const pillars = scorecard.pillars || DEFAULT_PILLARS;
  const checks = await ServiceCheck.find({ service: serviceId });

  const pillarScores: Record<string, { totalWeight: number; passedWeight: number }> = {};
  
  // Initialize
  for (const pillar of pillars) {
    pillarScores[pillar.key] = { totalWeight: 0, passedWeight: 0 };
  }

  // Aggregate checks
  for (const check of checks) {
    const pillarKey = check.pillar || 'other';
    const weight = check.checkWeight || 1;

    // Only count towards defined pillars? Or 'other' too?
    // If 'other' is not in pillars config, it won't contribute to the score unless we handle it.
    // For now, if pillar is not in pillars config, we might ignore it or add to a default bucket.
    // Let's assume we map to existing pillars.
    if (pillarScores[pillarKey]) {
      pillarScores[pillarKey].totalWeight += weight;
      if (check.status === CheckStatus.PASS) {
        pillarScores[pillarKey].passedWeight += weight;
      }
    }
  }

  // Calculate Score
  let totalScore = 0;
  let totalPillarWeight = 0;

  for (const pillar of pillars) {
    const stats = pillarScores[pillar.key];
    if (stats && stats.totalWeight > 0) {
      const pScore = (stats.passedWeight / stats.totalWeight) * 100;
      totalScore += pScore * pillar.weight;
      totalPillarWeight += pillar.weight;
    }
  }

  const finalScore = totalPillarWeight > 0 ? Math.round(totalScore / totalPillarWeight) : 0;

  // Update Service Readiness
  let readiness = ServiceReadiness.FAIL;
  if (finalScore >= 90) readiness = ServiceReadiness.GOLD;
  else if (finalScore >= 70) readiness = ServiceReadiness.SILVER;
  else if (finalScore >= 40) readiness = ServiceReadiness.BRONZE;

  await Service.findByIdAndUpdate(serviceId, { 
    readiness,
    score: finalScore,
    // lastSeenAt not updated here as this is just a recalc
  });

  return finalScore;
}

