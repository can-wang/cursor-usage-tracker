import {
  sendTeamsAlert,
  sendTeamsBatch,
  sendPlanExhaustionAlert,
  sendCycleSummary,
  sendCollectionErrorAlert,
} from "../src/lib/alerts/teams";
import type { Anomaly, Incident } from "../src/lib/types";
import type { CycleSummaryData } from "../src/lib/data";

const DASHBOARD_URL = "https://cursor-usage-tracker.example.com";

function mkAnomaly(
  id: number,
  userEmail: string,
  severity: "critical" | "warning",
  message: string,
): Anomaly {
  return {
    id,
    userEmail,
    userName: userEmail.split("@")[0] ?? userEmail,
    type: "threshold:spend",
    severity,
    message,
    value: 214,
    threshold: 50,
    metadata: {},
    detectedAt: new Date().toISOString(),
    resolvedAt: null,
  } as unknown as Anomaly;
}

function mkIncident(id: number, anomalyId: number): Incident {
  return {
    id,
    anomalyId,
    status: "open",
    severity: "critical",
    createdAt: new Date().toISOString(),
    alertedAt: null,
    acknowledgedAt: null,
    resolvedAt: null,
  } as unknown as Incident;
}

async function main() {
  if (!process.env.TEAMS_WEBHOOK_URL) {
    console.error("TEAMS_WEBHOOK_URL is not set");
    process.exit(1);
  }

  console.log("\n=== 1. Single anomaly alert (critical) ===");
  const a1 = mkAnomaly(
    1001,
    "alice@company.com",
    "critical",
    "Alice: daily spend spiked to $214 (4.2x her 7-day avg of $51)",
  );
  const i1 = mkIncident(42, 1001);
  await sendTeamsAlert(a1, i1, { dashboardUrl: DASHBOARD_URL });
  await sleep(1500);

  console.log("\n=== 2. Single anomaly alert (warning) ===");
  const a2 = mkAnomaly(
    1002,
    "bob@company.com",
    "warning",
    "Bob: cost/request spiked to $1.45 (4.2x his avg of $0.34), using opus-max",
  );
  const i2 = mkIncident(43, 1002);
  await sendTeamsAlert(a2, i2, { dashboardUrl: DASHBOARD_URL });
  await sleep(1500);

  console.log("\n=== 3. Batch summary (6 anomalies → triggers summary mode) ===");
  const batch = [
    {
      anomaly: mkAnomaly(
        2001,
        "alice@company.com",
        "critical",
        "daily spend spiked to $214 (4.2x her 7-day avg)",
      ),
      incident: mkIncident(51, 2001),
    },
    {
      anomaly: mkAnomaly(
        2002,
        "bob@company.com",
        "critical",
        "cycle spend $957 is 5.1x the team median ($188)",
      ),
      incident: mkIncident(52, 2002),
    },
    {
      anomaly: mkAnomaly(
        2003,
        "carol@company.com",
        "warning",
        "daily spend $214 is 3.2σ above team mean ($42)",
      ),
      incident: mkIncident(53, 2003),
    },
    {
      anomaly: mkAnomaly(
        2004,
        "dave@company.com",
        "warning",
        "cost/request spiked to $1.45 (4.2x his avg of $0.34), using opus-max",
      ),
      incident: mkIncident(54, 2004),
    },
    {
      anomaly: mkAnomaly(2005, "eve@company.com", "warning", "spent $82 this cycle (limit: $50)"),
      incident: mkIncident(55, 2005),
    },
    {
      anomaly: mkAnomaly(
        2006,
        "frank@company.com",
        "critical",
        "agent requests spiked to 487/day (5.6x his avg)",
      ),
      incident: mkIncident(56, 2006),
    },
  ];
  await sendTeamsBatch(batch, { dashboardUrl: DASHBOARD_URL });
  await sleep(1500);

  console.log("\n=== 4. Plan exhaustion alert ===");
  await sendPlanExhaustionAlert(
    {
      totalPlanExhausted: 65,
      totalActive: 151,
      newSinceLastAlert: 8,
      newUserNames: "alice, bob, carol, dave, eve +3 more",
    },
    { dashboardUrl: DASHBOARD_URL },
  );
  await sleep(1500);

  console.log("\n=== 5. Cycle summary ===");
  const cycleData: CycleSummaryData = {
    cycleStart: "2026-03-22",
    cycleEnd: "2026-04-22",
    daysRemaining: 2,
    totalSpendDollars: 12_847,
    previousCycleSpendDollars: 10_921,
    totalMembers: 151,
    activeMembers: 127,
    unusedSeats: 24,
    planExhausted: { exhausted: 65, totalActive: 127 },
    topSpenders: [
      { name: "Alice Smith", spendDollars: 987 },
      { name: "Bob Jones", spendDollars: 743 },
      { name: "Carol Davis", spendDollars: 612 },
      { name: "Dave Wilson", spendDollars: 548 },
      { name: "Eve Taylor", spendDollars: 491 },
    ],
    adoptionTiers: { aiNative: 34, high: 52, moderate: 28, low: 9, manual: 4 },
  };
  await sendCycleSummary(cycleData, { dashboardUrl: DASHBOARD_URL });
  await sleep(1500);

  console.log("\n=== 6. Collection error alert ===");
  await sendCollectionErrorAlert(
    [
      "Admin API: 429 Too Many Requests on /teams/daily-usage-data (retries exhausted)",
      "Analytics API: timeout fetching /analytics/team/mcp after 30s",
      "AI Code Tracking API: 500 Internal Server Error on /analytics/ai-code/commits",
    ],
    { dashboardUrl: DASHBOARD_URL },
  );

  console.log("\nDone. Check your Teams channel.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
