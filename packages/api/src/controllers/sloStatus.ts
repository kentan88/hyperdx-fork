import { createNativeClient } from '@hyperdx/common-utils/dist/clickhouse/node';
import ms from 'ms';

import * as config from '@/config';
import type { ObjectId } from '@/models';
import SLO, { ISLO, SLOStatus } from '@/models/slo';
import logger from '@/utils/logger';

export interface SLOStatusResult {
  slo: ISLO;
  achieved: number;
  target: number;
  errorBudgetRemaining: number;
  status: SLOStatus;
  numerator: number;
  denominator: number;
  windowStart: Date;
  windowEnd: Date;
  timestamp: Date;
  burnRate?: number; // Current burn rate
}

/**
 * Calculate SLO status from measurements or compute on-demand
 * @param realtime - If true, compute from raw events table instead of aggregates (slower but real-time)
 */
export async function getSLOStatus(
  sloId: string,
  teamId: ObjectId,
  realtime: boolean = false,
): Promise<SLOStatusResult | null> {
  const slo = await SLO.findOne({ _id: sloId, team: teamId });
  if (!slo) {
    return null;
  }

  const clickhouseClient = createNativeClient({
    url: config.CLICKHOUSE_HOST,
    username: config.CLICKHOUSE_USER,
    password: config.CLICKHOUSE_PASSWORD,
    request_timeout: ms('2m'),
  });

  try {
    const timeWindowMs = ms(slo.timeWindow);
    const windowStart = new Date(Date.now() - timeWindowMs);
    let numerator: number;
    let denominator: number;

    if (realtime && slo.filter && slo.goodCondition) {
      // Real-time computation from raw events (only works with builder mode)
      const startTimeStr = windowStart.toISOString().slice(0, 19).replace('T', ' ');
      const endTimeStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const realtimeQuery = `
        SELECT
          countIf(${slo.goodCondition}) as numerator,
          count() as denominator
        FROM default.${slo.sourceTable}
        WHERE ${slo.filter}
          AND Timestamp >= '${startTimeStr}'
          AND Timestamp <= '${endTimeStr}'
      `;

      const realtimeRes = await clickhouseClient.query({
        query: realtimeQuery,
        format: 'JSON',
      });

      const realtimeData = (await realtimeRes.json()) as {
        data: Array<{ numerator: number; denominator: number }>;
      };

      numerator = Number(realtimeData.data?.[0]?.numerator || 0);
      denominator = Number(realtimeData.data?.[0]?.denominator || 0);
    } else {
      // Calculate status from slo_aggregates (Source of Truth - faster)
      const statusQuery = `
          SELECT 
              sum(numerator_count) as numerator,
              sum(denominator_count) as denominator
          FROM default.slo_aggregates
          WHERE slo_id = {sloId: String}
            AND timestamp >= {windowStart: DateTime}
      `;

      const statusRes = await clickhouseClient.query({
        query: statusQuery,
        query_params: {
          sloId: slo.id,
          windowStart: windowStart.toISOString().slice(0, 19).replace('T', ' '),
        },
        format: 'JSON',
      });
      
      const statusData = (await statusRes.json()) as {
        data: Array<{ numerator: number; denominator: number }>;
      };

      numerator = Number(statusData.data?.[0]?.numerator || 0);
      denominator = Number(statusData.data?.[0]?.denominator || 0);
    }

    // If no data, return empty state
    if (denominator === 0 && numerator === 0) {
        return {
            slo,
            achieved: 100, // Default to 100% if no data
            target: slo.targetValue,
            errorBudgetRemaining: 100,
            status: SLOStatus.HEALTHY,
            numerator: 0,
            denominator: 0,
            windowStart,
            windowEnd: new Date(),
            timestamp: new Date(),
        };
    }

    // Calculate achieved percentage
    const achieved = denominator > 0 ? (numerator / denominator) * 100 : 100;

    // Calculate error budget remaining
    const errorBudgetTotal = (1 - slo.targetValue / 100) * timeWindowMs;
    const errorBudgetUsed = (1 - achieved / 100) * timeWindowMs;
    const errorBudgetRemaining = Math.max(0, errorBudgetTotal - errorBudgetUsed);
    const errorBudgetRemainingPercent =
      errorBudgetTotal > 0
        ? (errorBudgetRemaining / errorBudgetTotal) * 100
        : 0;

    // Calculate burn rate: actualErrorRate / expectedErrorRate
    const expectedErrorRate = (1 - slo.targetValue / 100);
    const actualErrorRate = denominator > 0 ? (1 - numerator / denominator) : 0;
    const burnRate = expectedErrorRate > 0 
      ? actualErrorRate / expectedErrorRate 
      : (actualErrorRate > 0 ? Infinity : 0);

    // Determine status
    let status: SLOStatus;
    if (achieved >= slo.targetValue) {
      status = SLOStatus.HEALTHY;
    } else if (
      errorBudgetRemainingPercent > 0 &&
      errorBudgetRemainingPercent <= 10
    ) {
      status = SLOStatus.AT_RISK;
    } else {
      status = SLOStatus.BREACHED;
    }

    return {
      slo,
      achieved,
      target: slo.targetValue,
      errorBudgetRemaining: errorBudgetRemainingPercent,
      status,
      numerator,
      denominator,
      windowStart,
      windowEnd: new Date(),
      timestamp: new Date(),
      burnRate,
    };

  } catch (error: any) {
    logger.warn(
      { error, sloId },
      'Failed to get SLO status from ClickHouse aggregates',
    );
  }

  // Fallback (rarely reached if CH is up)
  return null;
}

// computeSLOStatusOnDemand REMOVED - no longer needed as we use aggregates.

/**
 * Get SLO burn rate over time
 */
export async function getSLOBurnRate(
  sloId: string,
  teamId: ObjectId,
  timeStart: Date,
  timeEnd: Date,
): Promise<
  Array<{
    timestamp: Date;
    achieved: number;
    burnRate: number;
    errorBudgetRemaining: number;
  }>
> {
  const slo = await SLO.findOne({ _id: sloId, team: teamId });
  if (!slo) {
    throw new Error('SLO not found');
  }

  const clickhouseClient = createNativeClient({
    url: config.CLICKHOUSE_HOST,
    username: config.CLICKHOUSE_USER,
    password: config.CLICKHOUSE_PASSWORD,
    request_timeout: ms('2m'),
  });

  // Aggregate by hour (or minute?) for the burn rate chart
  // Grouping by minute for high fidelity
  const result = await clickhouseClient.query({
    query: `
      SELECT
        timestamp,
        sum(numerator_count) as numerator,
        sum(denominator_count) as denominator
      FROM default.slo_aggregates
      WHERE slo_id = {sloId: String}
        AND timestamp >= {timeStart: DateTime}
        AND timestamp <= {timeEnd: DateTime}
      GROUP BY timestamp
      ORDER BY timestamp ASC
    `,
    query_params: {
      sloId: slo.id,
      timeStart: timeStart.toISOString().slice(0, 19).replace('T', ' '),
      timeEnd: timeEnd.toISOString().slice(0, 19).replace('T', ' '),
    },
    format: 'JSON',
  });

  const data = (await result.json()) as {
    data: Array<{
      timestamp: string;
      numerator: number;
      denominator: number;
    }>;
  };

  // Calculate true burn rate: actualErrorRate / expectedErrorRate
  // Burn rate of 1.0 = consuming budget evenly (will deplete exactly at window end)
  // Burn rate of 2.0 = consuming twice as fast (will deplete in half the window)
  const expectedErrorRate = (1 - slo.targetValue / 100);
  
  return (data.data || []).map(d => {
      const num = Number(d.numerator);
      const den = Number(d.denominator);
      const achieved = den > 0 ? (num / den) * 100 : 100;
      const actualErrorRate = den > 0 ? (1 - num/den) : 0;
      
      // Calculate burn rate: actualErrorRate / expectedErrorRate
      // If expectedErrorRate is 0 (100% target), burn rate is undefined (infinite)
      const burnRate = expectedErrorRate > 0 
        ? actualErrorRate / expectedErrorRate 
        : (actualErrorRate > 0 ? Infinity : 0);
      
      return {
          timestamp: new Date(d.timestamp),
          achieved,
          burnRate,
          errorBudgetRemaining: 0 // Not computed per-bucket for this chart
      };
  });
}

