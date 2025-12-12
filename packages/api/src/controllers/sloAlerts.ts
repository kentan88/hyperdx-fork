import { AlertState } from '@/models/alert';
import { ISLO } from '@/models/slo';
import { IWebhook } from '@/models/webhook';
import { handleSendGenericWebhook } from '@/tasks/checkAlerts/template';
import logger from '@/utils/logger';
import { serializeError } from 'serialize-error';

/**
 * Send a burn alert notification for an SLO
 */
export async function sendSLOBurnAlert(
  slo: ISLO,
  burnRate: number,
  severity: 'warning' | 'critical',
  webhook: IWebhook,
  achieved: number,
  target: number,
  errorBudgetRemaining: number,
): Promise<void> {
  const severityEmoji = severity === 'critical' ? '🔴' : '⚠️';
  const title = `${severityEmoji} SLO Burn Alert: ${slo.serviceName} - ${slo.sloName}`;

  const body = `SLO "${slo.sloName}" for service "${slo.serviceName}" is burning error budget at ${burnRate.toFixed(2)}x the expected rate.

**Current Status:**
- Target: ${target.toFixed(2)}%
- Achieved: ${achieved.toFixed(2)}%
- Error Budget Remaining: ${errorBudgetRemaining.toFixed(2)}%
- Burn Rate: ${burnRate.toFixed(2)}x

**Severity:** ${severity.toUpperCase()}

A burn rate of ${burnRate.toFixed(2)} means the error budget is being consumed ${burnRate.toFixed(2)} times faster than expected. At this rate, the error budget will be depleted before the SLO window ends.`;

  const now = Date.now();
  const frontendUrl = process.env.FRONTEND_URL || '';

  try {
    await handleSendGenericWebhook(webhook, {
      hdxLink: `${frontendUrl}/slos/${slo.id}`,
      title,
      body,
      state: AlertState.ALERT,
      startTime: now,
      endTime: now,
      eventId: `slo-burn-${slo.id}-${severity}-${now}`,
    });

    logger.info(
      {
        sloId: slo.id,
        sloName: slo.sloName,
        serviceName: slo.serviceName,
        burnRate,
        severity,
      },
      'Sent SLO burn alert notification',
    );
  } catch (err) {
    logger.error(
      {
        sloId: slo.id,
        error: serializeError(err),
      },
      'Failed to send SLO burn alert notification',
    );
    throw err;
  }
}

/**
 * Check if burn rate exceeds thresholds and send alerts if needed
 */
export async function checkSLOBurnAlerts(
  slo: ISLO,
  burnRate: number,
  achieved: number,
  target: number,
  errorBudgetRemaining: number,
  webhook: IWebhook | undefined,
): Promise<{
  shouldAlert: boolean;
  severity?: 'warning' | 'critical';
}> {
  // Check if burn alerts are enabled
  if (!slo.burnAlerts?.enabled || !slo.burnAlerts.thresholds.length) {
    return { shouldAlert: false };
  }

  if (!webhook) {
    logger.warn(
      { sloId: slo.id },
      'SLO has burn alerts enabled but no webhook configured',
    );
    return { shouldAlert: false };
  }

  // Sort thresholds by burn rate (descending) to check critical first
  const sortedThresholds = [...slo.burnAlerts.thresholds].sort(
    (a, b) => b.burnRate - a.burnRate,
  );

  // Find the highest threshold that's been exceeded
  for (const threshold of sortedThresholds) {
    if (burnRate >= threshold.burnRate) {
      // Check if we've already alerted for this severity recently
      // Only alert if severity changed or if it's been more than 1 hour since last alert
      const lastAlert = slo.lastBurnAlertState;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const shouldAlert =
        !lastAlert ||
        lastAlert.severity !== threshold.severity ||
        lastAlert.timestamp < oneHourAgo;

      if (shouldAlert) {
        return {
          shouldAlert: true,
          severity: threshold.severity,
        };
      }
      break;
    }
  }

  return { shouldAlert: false };
}

