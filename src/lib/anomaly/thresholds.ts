import type { Anomaly, DetectionConfig } from "../types";
import {
  getLatestCycleSpenders,
  getActiveDailyUsage,
  getLatestCycleStart,
  getPlanExhaustedUsers,
  getMetadata,
  getTeamTotalSpendForCycle,
} from "../data";

export function detectThresholdAnomalies(config: DetectionConfig): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  const spenders = getLatestCycleSpenders();

  for (const s of spenders) {
    if (
      config.thresholds.maxSpendCentsPerCycle > 0 &&
      s.spend_cents > config.thresholds.maxSpendCentsPerCycle
    ) {
      anomalies.push({
        userEmail: s.email,
        type: "threshold",
        severity:
          s.spend_cents > config.thresholds.maxSpendCentsPerCycle * 2 ? "critical" : "warning",
        metric: "spend",
        value: s.spend_cents,
        threshold: config.thresholds.maxSpendCentsPerCycle,
        message: `${s.name}: spend $${(s.spend_cents / 100).toFixed(2)} exceeds limit $${(config.thresholds.maxSpendCentsPerCycle / 100).toFixed(2)} (${s.fast_premium_requests} premium reqs)`,
        detectedAt: now,
        resolvedAt: null,
        alertedAt: null,
        diagnosisModel: null,
        diagnosisKind: null,
        diagnosisDelta: null,
      });
    }
  }

  const today = new Date().toISOString().split("T")[0] ?? "";
  const dailyRequests = getActiveDailyUsage(today);

  for (const r of dailyRequests) {
    if (
      config.thresholds.maxRequestsPerDay > 0 &&
      r.agent_requests > config.thresholds.maxRequestsPerDay
    ) {
      anomalies.push({
        userEmail: r.email,
        type: "threshold",
        severity:
          r.agent_requests > config.thresholds.maxRequestsPerDay * 2 ? "critical" : "warning",
        metric: "requests",
        value: r.agent_requests,
        threshold: config.thresholds.maxRequestsPerDay,
        message: `${r.agent_requests} agent requests today exceeds limit of ${config.thresholds.maxRequestsPerDay} (model: ${r.most_used_model})`,
        detectedAt: now,
        resolvedAt: null,
        alertedAt: null,
        diagnosisModel: r.most_used_model || null,
        diagnosisKind: null,
        diagnosisDelta: null,
      });
    }
  }

  const cycleStart = getLatestCycleStart();

  if (cycleStart && config.enableInfoAnomalies) {
    const planExhausted = getPlanExhaustedUsers(cycleStart);

    for (const u of planExhausted) {
      const name = u.name ?? u.email;
      const dayNum =
        Math.floor(
          (new Date(u.exhausted_on).getTime() - new Date(cycleStart).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;
      anomalies.push({
        userEmail: u.email,
        type: "threshold",
        severity: "info",
        metric: "plan_exhausted",
        value: u.total_usage_reqs,
        threshold: 0,
        message: `${name}: exceeded included plan usage on day ${dayNum} of cycle (${u.exhausted_on}). ${u.total_usage_reqs} extra requests billed since.`,
        detectedAt: now,
        resolvedAt: null,
        alertedAt: null,
        diagnosisModel: null,
        diagnosisKind: null,
        diagnosisDelta: null,
      });
    }
  }

  const limitedCountStr = getMetadata("limited_users_count");
  const limitedCount = limitedCountStr ? parseInt(limitedCountStr, 10) : 0;

  if (limitedCount > 0) {
    anomalies.push({
      userEmail: "team",
      type: "threshold",
      severity: "warning",
      metric: "users_limited",
      value: limitedCount,
      threshold: 0,
      message: `${limitedCount} team members are limited and unable to make requests. Review team spend limits on the Cursor dashboard.`,
      detectedAt: now,
      resolvedAt: null,
      alertedAt: null,
      diagnosisModel: null,
      diagnosisKind: null,
      diagnosisDelta: null,
    });
  }

  const budgetStr = getMetadata("team_budget_threshold");
  const budgetThreshold = budgetStr ? parseFloat(budgetStr) : 0;

  if (budgetThreshold > 0) {
    const teamSpendCents = getTeamTotalSpendForCycle();
    const teamSpendDollars = teamSpendCents / 100;

    if (teamSpendDollars >= budgetThreshold) {
      anomalies.push({
        userEmail: "team",
        type: "threshold",
        severity: teamSpendDollars >= budgetThreshold * 1.1 ? "critical" : "warning",
        metric: "team_budget",
        value: Math.round(teamSpendDollars * 100),
        threshold: Math.round(budgetThreshold * 100),
        message: `Team spend $${Math.round(teamSpendDollars).toLocaleString()} has reached the $${Math.round(budgetThreshold).toLocaleString()} budget threshold (${Math.round((teamSpendDollars / budgetThreshold) * 100)}%).`,
        detectedAt: now,
        resolvedAt: null,
        alertedAt: null,
        diagnosisModel: null,
        diagnosisKind: null,
        diagnosisDelta: null,
      });
    }
  }

  return anomalies;
}
