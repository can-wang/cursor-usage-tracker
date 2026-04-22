import { NextResponse } from "next/server";
import { collectAll } from "@/lib/collector";
import { runDetection } from "@/lib/anomaly/detector";
import { processNewAnomalies } from "@/lib/incidents";
import { sendAlerts } from "@/lib/alerts";
import {
  sendPlanExhaustionAlert as sendSlackPlanExhaustionAlert,
  sendCycleSummary as sendSlackCycleSummary,
  sendCollectionErrorAlert as sendSlackCollectionErrorAlert,
} from "@/lib/alerts/slack";
import {
  sendPlanExhaustionAlert as sendTeamsPlanExhaustionAlert,
  sendCycleSummary as sendTeamsCycleSummary,
  sendCollectionErrorAlert as sendTeamsCollectionErrorAlert,
} from "@/lib/alerts/teams";
import {
  getMetadata,
  setMetadata,
  getPlanExhaustionStats,
  getCycleSummaryData,
  getConfig,
} from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret =
    request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown> = {};

  try {
    const collectionResult = await collectAll();
    results.collection = collectionResult;

    if (collectionResult.errors.length > 0) {
      const [slackSent, teamsSent] = await Promise.all([
        sendSlackCollectionErrorAlert(collectionResult.errors, {
          dashboardUrl: process.env.DASHBOARD_URL,
        }),
        sendTeamsCollectionErrorAlert(collectionResult.errors, {
          dashboardUrl: process.env.DASHBOARD_URL,
        }),
      ]);
      results.collectionErrorAlert = { slack: slackSent, teams: teamsSent };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.collection = { error: msg };

    const [slackSent, teamsSent] = await Promise.all([
      sendSlackCollectionErrorAlert([msg], { dashboardUrl: process.env.DASHBOARD_URL }),
      sendTeamsCollectionErrorAlert([msg], { dashboardUrl: process.env.DASHBOARD_URL }),
    ]);
    results.collectionErrorAlert = { slack: slackSent, teams: teamsSent };
  }

  try {
    const detectionResult = runDetection();
    results.detection = {
      newAnomalies: detectionResult.newAnomalies.length,
      resolved: detectionResult.resolvedCount,
      totalOpen: detectionResult.totalOpen,
    };

    const alertable = detectionResult.newAnomalies.filter((a) => a.severity !== "info");
    if (alertable.length > 0) {
      const pairs = processNewAnomalies(alertable);
      const alertResult = await sendAlerts(pairs, {
        dashboardUrl: process.env.DASHBOARD_URL,
      });
      results.alerts = alertResult;
    }

    const infoOnly = detectionResult.newAnomalies.filter((a) => a.severity === "info");
    if (infoOnly.length > 0) {
      processNewAnomalies(infoOnly);
      results.infoAnomalies = infoOnly.length;
    }
  } catch (error) {
    results.detection = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const config = getConfig();
    if (!config.planExhaustion.enabled) {
      results.planExhaustionAlert = "disabled";
    } else {
      const planStats = getPlanExhaustionStats();
      const currentCount = planStats.summary.users_exhausted;
      const lastCountStr = getMetadata("last_plan_exhaustion_count");
      const lastCountRaw = lastCountStr ? parseInt(lastCountStr, 10) : 0;
      const lastCount = lastCountRaw > currentCount ? 0 : lastCountRaw;
      const delta = currentCount - lastCount;
      const minDelta = config.planExhaustion.minDeltaSinceLastAlert;

      if (currentCount === 0) {
        results.planExhaustionAlert = "none_exhausted";
      } else if (lastCount === 0 || delta >= minDelta) {
        const newUsers = lastCount === 0 ? planStats.users : planStats.users.slice(-delta);
        const nameList = newUsers
          .slice(0, 5)
          .map((u) => u.name || u.email.split("@")[0])
          .join(", ");
        const moreCount = newUsers.length > 5 ? newUsers.length - 5 : 0;

        const payload = {
          totalPlanExhausted: currentCount,
          totalActive: planStats.summary.total_active,
          newSinceLastAlert: delta > 0 ? delta : currentCount,
          newUserNames: nameList + (moreCount > 0 ? ` +${moreCount} more` : ""),
        };
        const [slackSent, teamsSent] = await Promise.all([
          sendSlackPlanExhaustionAlert(payload, { dashboardUrl: process.env.DASHBOARD_URL }),
          sendTeamsPlanExhaustionAlert(payload, { dashboardUrl: process.env.DASHBOARD_URL }),
        ]);
        if (slackSent || teamsSent) {
          setMetadata("last_plan_exhaustion_count", String(currentCount));
          results.planExhaustionAlert = { slack: slackSent, teams: teamsSent };
        } else {
          results.planExhaustionAlert = "failed";
        }
      } else {
        results.planExhaustionAlert = `skipped (delta ${delta} < min ${minDelta})`;
      }
    }
  } catch (error) {
    results.planExhaustionAlert = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const cycleEnd = getMetadata("cycle_end");
    const cycleStart = getMetadata("cycle_start");
    const lastCycleSummary = getMetadata("last_cycle_summary");

    if (cycleEnd && cycleStart && lastCycleSummary !== cycleStart) {
      const daysRemaining = Math.ceil((new Date(cycleEnd).getTime() - Date.now()) / 86_400_000);

      if (daysRemaining <= 3 && daysRemaining >= 0) {
        const summaryData = getCycleSummaryData();
        if (summaryData) {
          const [slackSent, teamsSent] = await Promise.all([
            sendSlackCycleSummary(summaryData, { dashboardUrl: process.env.DASHBOARD_URL }),
            sendTeamsCycleSummary(summaryData, { dashboardUrl: process.env.DASHBOARD_URL }),
          ]);
          if (slackSent || teamsSent) {
            setMetadata("last_cycle_summary", cycleStart);
            results.cycleSummary = { slack: slackSent, teams: teamsSent };
          } else {
            results.cycleSummary = "failed";
          }
        } else {
          results.cycleSummary = "no_data";
        }
      } else {
        results.cycleSummary = `not_due (${daysRemaining} days remaining)`;
      }
    } else if (lastCycleSummary === cycleStart) {
      results.cycleSummary = "already_sent_this_cycle";
    } else {
      results.cycleSummary = "no_cycle_data";
    }
  } catch (error) {
    results.cycleSummary = {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  results.durationMs = Date.now() - startTime;

  return NextResponse.json(results);
}
