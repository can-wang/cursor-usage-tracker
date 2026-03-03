import type { Anomaly, DetectionConfig } from "../types";
import {
  getDailySpendWithNames,
  getLatestDailySpendDate,
  getUserDailySpendHistory,
  getCycleSpendWithModels,
  getUserCostPerRequest,
} from "../data";

const MIN_DAILY_SPEND_CENTS = 5000;
const MIN_CYCLE_MEDIAN_CENTS = 1000;

export function detectTrendAnomalies(config: DetectionConfig): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();
  const {
    spendSpikeMultiplier,
    spendSpikeLookbackDays,
    cycleOutlierMultiplier,
    costPerReqSpikeMultiplier,
    costPerReqMinSpendCents,
  } = config.trends;

  detectSpendSpikes(anomalies, now, spendSpikeMultiplier, spendSpikeLookbackDays);
  detectCycleOutliers(anomalies, now, cycleOutlierMultiplier);
  detectCostPerReqSpikes(
    anomalies,
    now,
    costPerReqSpikeMultiplier,
    costPerReqMinSpendCents,
    spendSpikeLookbackDays,
  );

  return anomalies;
}

function detectSpendSpikes(
  anomalies: Anomaly[],
  now: string,
  spikeMultiplier: number,
  lookbackDays: number,
): void {
  const targetDate = getLatestDailySpendDate();
  if (!targetDate) return;

  const todaySpend = getDailySpendWithNames(targetDate);

  for (const user of todaySpend) {
    if (user.spend_cents < MIN_DAILY_SPEND_CENTS) continue;

    const history = getUserDailySpendHistory(user.email, targetDate, lookbackDays);

    if (!history.avg_spend || history.avg_spend < 100) continue;

    const ratio = user.spend_cents / history.avg_spend;
    if (ratio > spikeMultiplier) {
      const todayDollars = (user.spend_cents / 100).toFixed(2);
      const avgDollars = (history.avg_spend / 100).toFixed(2);
      anomalies.push({
        userEmail: user.email,
        type: "trend",
        severity: ratio > spikeMultiplier * 3 ? "critical" : "warning",
        metric: "spend",
        value: user.spend_cents,
        threshold: history.avg_spend * spikeMultiplier,
        message: `${user.name}: daily spend spiked to $${todayDollars} (${ratio.toFixed(1)}x their ${lookbackDays}-day avg of $${avgDollars}) — model: ${user.most_used_model || "unknown"}`,
        detectedAt: now,
        resolvedAt: null,
        alertedAt: null,
        diagnosisModel: user.most_used_model || null,
        diagnosisKind: null,
        diagnosisDelta: user.spend_cents - history.avg_spend,
      });
    }
  }
}

function detectCycleOutliers(anomalies: Anomaly[], now: string, outlierMultiplier: number): void {
  const cycleSpend = getCycleSpendWithModels();

  if (cycleSpend.length < 5) return;

  const spends = cycleSpend.map((s) => s.spend_cents).sort((a, b) => a - b);
  const medianIndex = Math.floor(spends.length / 2);
  const median = spends[medianIndex] ?? 0;

  if (median < MIN_CYCLE_MEDIAN_CENTS) return;

  for (const user of cycleSpend) {
    const ratio = user.spend_cents / median;
    if (ratio > outlierMultiplier) {
      const userDollars = (user.spend_cents / 100).toFixed(2);
      const medianDollars = (median / 100).toFixed(2);
      anomalies.push({
        userEmail: user.email,
        type: "trend",
        severity: ratio > outlierMultiplier * 3 ? "critical" : "warning",
        metric: "spend",
        value: user.spend_cents,
        threshold: median * outlierMultiplier,
        message: `${user.name}: cycle spend $${userDollars} is ${ratio.toFixed(1)}x the team median ($${medianDollars}) — model: ${user.most_used_model || "unknown"}, ${user.fast_premium_requests} premium reqs`,
        detectedAt: now,
        resolvedAt: null,
        alertedAt: null,
        diagnosisModel: user.most_used_model || null,
        diagnosisKind: null,
        diagnosisDelta: user.spend_cents - median,
      });
    }
  }
}

function detectCostPerReqSpikes(
  anomalies: Anomaly[],
  now: string,
  spikeMultiplier: number,
  minSpendCents: number,
  lookbackDays: number,
): void {
  if (spikeMultiplier <= 0) return;

  const users = getUserCostPerRequest(lookbackDays);

  for (const user of users) {
    if (user.today_spend_cents < minSpendCents) continue;
    if (!user.hist_avg_cost_per_req || user.hist_avg_cost_per_req <= 0) continue;
    if (user.hist_days < 3) continue;

    const ratio = user.today_cost_per_req / user.hist_avg_cost_per_req;
    if (ratio <= spikeMultiplier) continue;

    const todayCpr = (user.today_cost_per_req / 100).toFixed(2);
    const histCpr = (user.hist_avg_cost_per_req / 100).toFixed(2);
    const todaySpend = (user.today_spend_cents / 100).toFixed(2);

    anomalies.push({
      userEmail: user.email,
      type: "trend",
      severity: ratio > spikeMultiplier * 2 ? "critical" : "warning",
      metric: "cost_per_req",
      value: Math.round(user.today_cost_per_req),
      threshold: Math.round(user.hist_avg_cost_per_req * spikeMultiplier),
      message: `${user.name}: cost/request spiked to $${todayCpr} (${ratio.toFixed(1)}x their avg of $${histCpr}) — using ${user.today_top_model || "unknown"}, $${todaySpend} total today across ${user.today_reqs} reqs`,
      detectedAt: now,
      resolvedAt: null,
      alertedAt: null,
      diagnosisModel: user.today_top_model || null,
      diagnosisKind: null,
      diagnosisDelta: user.today_spend_cents - user.today_reqs * user.hist_avg_cost_per_req,
    });
  }
}
