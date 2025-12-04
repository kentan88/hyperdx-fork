import mongoose from 'mongoose';
import Scorecard from '@/models/scorecard';
import { getScorecardForTeam } from '@/services/scorecard';

export async function getScorecard(teamId: string) {
  return getScorecardForTeam(new mongoose.Types.ObjectId(teamId));
}

export async function updateScorecard(
  teamId: string,
  updates: { pillars?: any[]; rules?: any[] }
) {
  return Scorecard.findOneAndUpdate(
    { team: teamId },
    { $set: updates },
    { upsert: true, new: true }
  );
}

