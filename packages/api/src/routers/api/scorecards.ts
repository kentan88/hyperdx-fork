import express from 'express';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import { getScorecard, updateScorecard } from '@/controllers/scorecards';
import { getNonNullUserWithTeam } from '@/middleware/auth';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);
    const scorecard = await getScorecard(teamId.toString());
    return res.json(scorecard);
  } catch (e) {
    next(e);
  }
});

router.put(
  '/',
  validateRequest({
    body: z.object({
      pillars: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          weight: z.number().min(0).max(100),
        })
      ).optional(),
      rules: z.array(
        z.object({
          id: z.string(),
          description: z.string().optional(),
          pillar: z.string(),
          weight: z.number().min(0),
        })
      ).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);
      const updated = await updateScorecard(teamId.toString(), req.body);
      return res.json(updated);
    } catch (e) {
      next(e);
    }
  }
);

export default router;

