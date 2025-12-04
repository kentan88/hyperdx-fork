import mongoose, { Schema } from 'mongoose';

import type { ObjectId } from '.';
import Team from './team';

export interface IScorecardColumn {
  key: string; // e.g., 'telemetry', 'ownership'
  label: string;
  weight: number; // 0-100
}

export interface IScorecardRule {
  id: string; // e.g., 'has_owner', 'has_logs'
  description: string;
  pillar: string; // matches IScorecardColumn.key
  weight: number; // relative weight within the pillar or global? Let's say global for now or normalized later. 
  // actually, usually it's check weight -> pillar score -> global score.
  // let's stick to check belongs to pillar.
}

export interface IScorecard {
  _id: ObjectId;
  team: ObjectId;
  pillars: IScorecardColumn[];
  // We can store rule overrides here if needed, but for now we might keep rules static in code 
  // and just allow mapping them to pillars?
  // Or better, store the full rule config here.
  rules: IScorecardRule[];
  
  updatedAt: Date;
}

export type ScorecardDocument = mongoose.HydratedDocument<IScorecard>;

const ScorecardSchema = new Schema<IScorecard>(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: Team.modelName,
      required: true,
      unique: true,
    },
    pillars: [
      {
        key: { type: String, required: true },
        label: { type: String, required: true },
        weight: { type: Number, required: true },
      },
    ],
    rules: [
      {
        id: { type: String, required: true },
        description: { type: String, required: false },
        pillar: { type: String, required: true },
        weight: { type: Number, required: true, default: 1 },
      },
    ],
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IScorecard>('Scorecard', ScorecardSchema);

