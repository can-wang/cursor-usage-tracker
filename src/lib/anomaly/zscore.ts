import type { Anomaly, DetectionConfig } from "../types";
import { getDailySpendWithNames, getLatestDailySpendDate } from "../data";

const MIN_DAILY_SPEND_CENTS = 5000;

function computeZScore(value: number, mean: number, stddev: number): number {
  if (stddev === 0) return value > mean ? Infinity : 0;
  return (value - mean) / stddev;
}

export function detectZScoreAnomalies(config: DetectionConfig): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();
  const { multiplier } = config.zscore;

  const targetDate = getLatestDailySpendDate();
  if (!targetDate) return anomalies;

  const todaySpend = getDailySpendWithNames(targetDate);

  if (todaySpend.length < 5) return anomalies;

  const spendValues = todaySpend.map((s) => s.spend_cents);
  const teamSpendMean = spendValues.reduce((a, b) => a + b, 0) / spendValues.length;
  const teamSpendStddev = Math.sqrt(
    spendValues.reduce((sum, v) => sum + (v - teamSpendMean) ** 2, 0) / spendValues.length,
  );

  if (teamSpendStddev === 0) return anomalies;

  for (const user of todaySpend) {
    if (user.spend_cents < MIN_DAILY_SPEND_CENTS) continue;

    const spendZ = computeZScore(user.spend_cents, teamSpendMean, teamSpendStddev);
    if (spendZ > multiplier) {
      const userDollars = (user.spend_cents / 100).toFixed(2);
      const meanDollars = (teamSpendMean / 100).toFixed(2);
      anomalies.push({
        userEmail: user.email,
        type: "zscore",
        severity: spendZ > multiplier * 3 ? "critical" : "warning",
        metric: "spend",
        value: user.spend_cents,
        threshold: teamSpendMean + multiplier * teamSpendStddev,
        message: `${user.name}: daily spend $${userDollars} is ${spendZ.toFixed(1)}σ above team mean ($${meanDollars}) — model: ${user.most_used_model}`,
        detectedAt: now,
        resolvedAt: null,
        alertedAt: null,
        diagnosisModel: user.most_used_model || null,
        diagnosisKind: null,
        diagnosisDelta: user.spend_cents - teamSpendMean,
      });
    }
  }

  return anomalies;
}
