import { ClickhouseClient, createNativeClient } from '@hyperdx/common-utils/dist/clickhouse/node';
import ms from 'ms';

import * as config from '@/config';
import { getAllTeams } from '@/controllers/team';
import Service, { ServiceReadiness } from '@/models/service';
import ServiceCheck, { CheckStatus, CheckType } from '@/models/serviceCheck';
import Scorecard, { IScorecardColumn, IScorecardRule } from '@/models/scorecard';
import SLO from '@/models/slo';
import logger from '@/utils/logger';
import { HdxTask, TaskArgs } from './types';
import { connectDB, mongooseConnection } from '@/models';

// Default Pillars
const DEFAULT_PILLARS: IScorecardColumn[] = [
  { key: 'telemetry', label: 'Telemetry', weight: 35 },
  { key: 'reliability', label: 'Reliability', weight: 35 },
  { key: 'ownership', label: 'Ownership', weight: 15 },
  { key: 'documentation', label: 'Documentation', weight: 15 },
];

// Default Rules Configuration
const DEFAULT_RULES: IScorecardRule[] = [
  { id: CheckType.HAS_LOGS, pillar: 'telemetry', weight: 1, description: 'Service must have logs in the last 24h' },
  { id: CheckType.HAS_TRACES, pillar: 'telemetry', weight: 1, description: 'Service must have traces in the last 24h' },
  { id: CheckType.HAS_SLO, pillar: 'reliability', weight: 1, description: 'Service must have at least one SLO defined' },
  { id: CheckType.HAS_OWNER, pillar: 'ownership', weight: 1, description: 'Service must have an owner assigned' },
  { id: CheckType.HAS_RUNBOOK, pillar: 'documentation', weight: 1, description: 'Service must have a runbook URL' },
  { id: CheckType.HAS_REPO, pillar: 'documentation', weight: 1, description: 'Service must have a repository URL' },
];

export default class RunReadinessChecksTask implements HdxTask<TaskArgs> {
  private clickhouseClient: ClickhouseClient | null = null;

  constructor(private args: TaskArgs) {}

  async execute(): Promise<void> {
    logger.info('Starting readiness checks task...');

    if (mongooseConnection.readyState !== 1) {
      await connectDB();
    }

    this.clickhouseClient = createNativeClient({
      url: config.CLICKHOUSE_HOST,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
      request_timeout: ms('1m'),
      compression: {
        request: false,
        response: false,
      },
    });

    const teams = await getAllTeams();
    let totalChecked = 0;

    for (const team of teams) {
      try {
        // Fetch or create Scorecard config
        let scorecard = await Scorecard.findOne({ team: team._id });
        if (!scorecard) {
          // Use defaults if not found (in memory, don't necessarily persist unless customized)
          // We could persist it here to ensure every team has one to edit
        }

        const pillars = scorecard?.pillars || DEFAULT_PILLARS;
        const rules = scorecard?.rules || DEFAULT_RULES;

        // Map rules for easy lookup
        const ruleMap = new Map(rules.map(r => [r.id, r]));

        const services = await Service.find({ team: team._id });
        
        for (const service of services) {
          totalChecked++;
          const checkResults: { type: CheckType; status: CheckStatus; message?: string; evidence?: any }[] = [];

          // 1. Metadata Checks
          checkResults.push({
            type: CheckType.HAS_OWNER,
            status: service.owner ? CheckStatus.PASS : CheckStatus.FAIL,
            message: service.owner ? undefined : 'Service has no owner assigned',
          });

          checkResults.push({
            type: CheckType.HAS_RUNBOOK,
            status: service.runbookUrl ? CheckStatus.PASS : CheckStatus.FAIL,
            message: service.runbookUrl ? undefined : 'Service has no runbook URL',
          });

          checkResults.push({
            type: CheckType.HAS_REPO,
            status: service.repoUrl ? CheckStatus.PASS : CheckStatus.FAIL,
            message: service.repoUrl ? undefined : 'Service has no repository URL',
          });

          // 2. SLO Check
          const sloCount = await SLO.countDocuments({ 
            team: team._id, 
            serviceName: service.name 
          });
          checkResults.push({
            type: CheckType.HAS_SLO,
            status: sloCount > 0 ? CheckStatus.PASS : CheckStatus.FAIL,
            message: sloCount > 0 ? undefined : 'Service has no SLOs defined',
            evidence: { sloCount },
          });

          // 3. Telemetry Checks (using ClickHouse)
          try {
            const logCount = await this.getTelemetryCount(service.name, 'otel_logs');
            checkResults.push({
              type: CheckType.HAS_LOGS,
              status: logCount > 0 ? CheckStatus.PASS : CheckStatus.FAIL,
              message: logCount > 0 ? undefined : 'No logs detected in the last 24 hours',
              evidence: { count: logCount, window: '24h' },
            });

            const traceCount = await this.getTelemetryCount(service.name, 'otel_traces');
            checkResults.push({
              type: CheckType.HAS_TRACES,
              status: traceCount > 0 ? CheckStatus.PASS : CheckStatus.FAIL,
              message: traceCount > 0 ? undefined : 'No traces detected in the last 24 hours',
              evidence: { count: traceCount, window: '24h' },
            });

          } catch (err) {
            logger.error({ err, service: service.name }, 'Failed to check telemetry presence');
            checkResults.push({ type: CheckType.HAS_LOGS, status: CheckStatus.FAIL, message: 'Failed to verify logs' });
            checkResults.push({ type: CheckType.HAS_TRACES, status: CheckStatus.FAIL, message: 'Failed to verify traces' });
          }

          // Persist Checks and Calculate Score
          const pillarScores: Record<string, { totalWeight: number; passedWeight: number }> = {};
          
          // Initialize pillar scores
          for (const pillar of pillars) {
            pillarScores[pillar.key] = { totalWeight: 0, passedWeight: 0 };
          }

          for (const res of checkResults) {
            const rule = ruleMap.get(res.type);
            const pillarKey = rule?.pillar || 'other';
            const weight = rule?.weight || 1;

            if (pillarScores[pillarKey]) {
              pillarScores[pillarKey].totalWeight += weight;
              if (res.status === CheckStatus.PASS) {
                pillarScores[pillarKey].passedWeight += weight;
              }
            }

            await ServiceCheck.findOneAndUpdate(
              { service: service._id, checkType: res.type },
              { 
                $set: { 
                  team: team._id,
                  status: res.status,
                  message: res.message,
                  pillar: pillarKey,
                  checkWeight: weight,
                  evidence: res.evidence,
                  updatedAt: new Date()
                } 
              },
              { upsert: true }
            );
          }

          // Calculate Overall Score
          let totalScore = 0;
          let totalPillarWeight = 0;

          for (const pillar of pillars) {
            const stats = pillarScores[pillar.key];
            if (stats && stats.totalWeight > 0) {
              const pScore = (stats.passedWeight / stats.totalWeight) * 100;
              totalScore += pScore * pillar.weight;
              totalPillarWeight += pillar.weight;
            } else {
              // If a pillar has no checks, we effectively ignore it? Or give it 100?
              // Let's assume ignore (normalize by active pillars)
              // But standard scorecard usually penalizes if no checks exist? 
              // Actually here we generated checks for every rule in DEFAULT_RULES.
              // So stats.totalWeight should be > 0 if rules exist.
            }
          }

          const finalScore = totalPillarWeight > 0 ? Math.round(totalScore / totalPillarWeight) : 0;

          // Legacy Readiness Logic (Keep for backward compatibility for now)
          let readiness = ServiceReadiness.FAIL;
          if (finalScore >= 90) readiness = ServiceReadiness.GOLD;
          else if (finalScore >= 70) readiness = ServiceReadiness.SILVER;
          else if (finalScore >= 40) readiness = ServiceReadiness.BRONZE;

          await Service.findByIdAndUpdate(service._id, { 
            readiness,
            score: finalScore,
            lastSeenAt: new Date(),
          });
        }
      } catch (err) {
        logger.error({ err, teamId: team._id }, 'Error running readiness checks for team');
      }
    }

    logger.info({ totalChecked }, 'Readiness checks task completed');
  }

  private async getTelemetryCount(serviceName: string, table: string): Promise<number> {
    if (!this.clickhouseClient) return 0;
    
    const query = `
      SELECT count() as count
      FROM default.${table}
      WHERE ServiceName = '${serviceName}'
      AND Timestamp > now() - INTERVAL 24 HOUR
    `;

    const result = await this.clickhouseClient.query({ query, format: 'JSONEachRow' });
    const rows = await result.json<Array<{ count: string }>>();
    return parseInt(rows[0]?.count || '0', 10);
  }

  async asyncDispose(): Promise<void> {
    if (this.clickhouseClient) {
      await this.clickhouseClient.close();
    }
  }

  name(): string {
    return 'RunReadinessChecksTask';
  }
}
