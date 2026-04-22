import type { Anomaly, Incident } from "../types";
import type { CycleSummaryData } from "../data";

const BATCH_THRESHOLD = 3;
const ADAPTIVE_CARD_VERSION = "1.5";

type AdaptiveElement =
  | {
      type: "TextBlock";
      text: string;
      size?: "Small" | "Default" | "Medium" | "Large" | "ExtraLarge";
      weight?: "Lighter" | "Default" | "Bolder";
      color?: "Default" | "Accent" | "Good" | "Warning" | "Attention";
      wrap?: boolean;
      isSubtle?: boolean;
      spacing?: "None" | "Small" | "Default" | "Medium" | "Large" | "ExtraLarge";
      separator?: boolean;
    }
  | {
      type: "FactSet";
      facts: Array<{ title: string; value: string }>;
      spacing?: "None" | "Small" | "Default" | "Medium" | "Large" | "ExtraLarge";
    }
  | {
      type: "Container";
      items: AdaptiveElement[];
      spacing?: "None" | "Small" | "Default" | "Medium" | "Large" | "ExtraLarge";
      separator?: boolean;
    };

type AdaptiveAction = { type: "Action.OpenUrl"; title: string; url: string };

interface AdaptiveCard {
  type: "AdaptiveCard";
  $schema: string;
  version: string;
  body: AdaptiveElement[];
  actions?: AdaptiveAction[];
  msteams?: { width?: "Full" };
}

function severityIcon(severity: string): string {
  return severity === "critical" ? "🚨" : "⚠️";
}

function buildAlertCard(anomaly: Anomaly, incident: Incident, dashboardUrl?: string): AdaptiveCard {
  const body: AdaptiveElement[] = [
    {
      type: "TextBlock",
      text: `${severityIcon(anomaly.severity)} Cursor Usage Alert — ${anomaly.severity.toUpperCase()}`,
      size: "Large",
      weight: "Bolder",
      color: anomaly.severity === "critical" ? "Attention" : "Warning",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: `**${anomaly.message}**`,
      wrap: true,
      spacing: "Small",
    },
    {
      type: "TextBlock",
      text: `Incident #${incident.id} · ${anomaly.detectedAt} · cursor-usage-tracker`,
      size: "Small",
      isSubtle: true,
      wrap: true,
      spacing: "Medium",
    },
  ];

  const actions: AdaptiveAction[] = [];
  if (dashboardUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View user details",
      url: `${dashboardUrl}/users/${encodeURIComponent(anomaly.userEmail)}`,
    });
    actions.push({
      type: "Action.OpenUrl",
      title: "All anomalies",
      url: `${dashboardUrl}/anomalies`,
    });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: ADAPTIVE_CARD_VERSION,
    body,
    ...(actions.length > 0 ? { actions } : {}),
    msteams: { width: "Full" },
  };
}

function buildSummaryCard(
  pairs: Array<{ anomaly: Anomaly; incident: Incident }>,
  dashboardUrl?: string,
): AdaptiveCard {
  const critical = pairs.filter((p) => p.anomaly.severity === "critical");
  const warnings = pairs.filter((p) => p.anomaly.severity === "warning");

  const lines = pairs.map(({ anomaly, incident }) => {
    const icon = severityIcon(anomaly.severity);
    return `${icon} **#${incident.id}** ${anomaly.userEmail}: ${anomaly.message}`;
  });

  const body: AdaptiveElement[] = [
    {
      type: "TextBlock",
      text: `Cursor Usage — ${pairs.length} anomalies detected`,
      size: "Large",
      weight: "Bolder",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: `**${critical.length}** critical · **${warnings.length}** warning`,
      wrap: true,
      spacing: "Small",
    },
  ];

  const MAX_BLOCK_CHARS = 2800;
  let chunk: string[] = [];
  let chunkLen = 0;

  for (const line of lines) {
    if (chunkLen + line.length + 2 > MAX_BLOCK_CHARS && chunk.length > 0) {
      body.push({
        type: "TextBlock",
        text: chunk.join("\n\n"),
        wrap: true,
        spacing: "Small",
      });
      chunk = [];
      chunkLen = 0;
    }
    chunk.push(line);
    chunkLen += line.length + 2;
  }
  if (chunk.length > 0) {
    body.push({
      type: "TextBlock",
      text: chunk.join("\n\n"),
      wrap: true,
      spacing: "Small",
    });
  }

  body.push({
    type: "TextBlock",
    text: `Detected at ${new Date().toISOString()} · cursor-usage-tracker`,
    size: "Small",
    isSubtle: true,
    wrap: true,
    spacing: "Medium",
  });

  const actions: AdaptiveAction[] = [];
  if (dashboardUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View all anomalies",
      url: `${dashboardUrl}/anomalies`,
    });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: ADAPTIVE_CARD_VERSION,
    body,
    ...(actions.length > 0 ? { actions } : {}),
    msteams: { width: "Full" },
  };
}

async function postToTeams(card: AdaptiveCard, fallbackText: string): Promise<boolean> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    return false;
  }

  const payload = {
    type: "message",
    summary: fallbackText,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: card,
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error(
        `[teams] HTTP error: ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
      );
      return false;
    }

    console.log("[teams] Message sent successfully");
    return true;
  } catch (err) {
    console.error("[teams] Failed to send:", err instanceof Error ? err.message : err);
    return false;
  }
}

export function isTeamsConfigured(): boolean {
  return Boolean(process.env.TEAMS_WEBHOOK_URL);
}

export async function sendTeamsAlert(
  anomaly: Anomaly,
  incident: Incident,
  options: { dashboardUrl?: string } = {},
): Promise<boolean> {
  if (!isTeamsConfigured()) {
    console.warn("[teams] Skipping alert — missing TEAMS_WEBHOOK_URL");
    return false;
  }

  const card = buildAlertCard(anomaly, incident, options.dashboardUrl);
  const text = `${severityIcon(anomaly.severity)} ${anomaly.message}`;
  return postToTeams(card, text);
}

export async function sendTeamsBatch(
  pairs: Array<{ anomaly: Anomaly; incident: Incident }>,
  options: { dashboardUrl?: string } = {},
): Promise<number> {
  if (!isTeamsConfigured()) {
    console.warn("[teams] Skipping batch — missing TEAMS_WEBHOOK_URL");
    return 0;
  }

  console.log(
    `[teams] Sending ${pairs.length} anomalies (${pairs.length <= BATCH_THRESHOLD ? "individual" : "summary"} mode)`,
  );

  if (pairs.length <= BATCH_THRESHOLD) {
    let sent = 0;
    for (const { anomaly, incident } of pairs) {
      const ok = await sendTeamsAlert(anomaly, incident, options);
      if (ok) sent++;
    }
    return sent;
  }

  const card = buildSummaryCard(pairs, options.dashboardUrl);
  const text = `Cursor Usage — ${pairs.length} anomalies detected`;
  const ok = await postToTeams(card, text);
  return ok ? pairs.length : 0;
}

export async function sendPlanExhaustionAlert(
  summary: {
    totalPlanExhausted: number;
    totalActive: number;
    newSinceLastAlert: number;
    newUserNames: string;
  },
  options: { dashboardUrl?: string } = {},
): Promise<boolean> {
  if (!isTeamsConfigured()) {
    console.warn("[teams] Skipping plan exhaustion alert — missing TEAMS_WEBHOOK_URL");
    return false;
  }

  const pct = Math.round((summary.totalPlanExhausted / summary.totalActive) * 100);

  const body: AdaptiveElement[] = [
    {
      type: "TextBlock",
      text: "⚡ Cursor — Plan Exhaustion Alert",
      size: "Large",
      weight: "Bolder",
      color: "Warning",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: `**${summary.newSinceLastAlert} new users** exceeded their plan (${summary.totalPlanExhausted}/${summary.totalActive} total, ${pct}%)`,
      wrap: true,
      spacing: "Small",
    },
    {
      type: "TextBlock",
      text: `**New:** ${summary.newUserNames}`,
      wrap: true,
      spacing: "Small",
    },
    {
      type: "TextBlock",
      text: `${new Date().toISOString().split("T")[0]} · cursor-usage-tracker`,
      size: "Small",
      isSubtle: true,
      wrap: true,
      spacing: "Medium",
    },
  ];

  const actions: AdaptiveAction[] = [];
  if (options.dashboardUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View dashboard",
      url: options.dashboardUrl,
    });
  }

  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: ADAPTIVE_CARD_VERSION,
    body,
    ...(actions.length > 0 ? { actions } : {}),
    msteams: { width: "Full" },
  };

  return postToTeams(
    card,
    `Cursor — ${summary.newSinceLastAlert} new users exceeded plan (${summary.totalPlanExhausted} total)`,
  );
}

export async function sendCycleSummary(
  data: CycleSummaryData,
  options: { dashboardUrl?: string } = {},
): Promise<boolean> {
  if (!isTeamsConfigured()) {
    console.warn("[teams] Skipping cycle summary — missing TEAMS_WEBHOOK_URL");
    return false;
  }

  const facts: Array<{ title: string; value: string }> = [];
  facts.push({ title: "Cycle Spend", value: `$${data.totalSpendDollars.toLocaleString()}` });

  if (data.previousCycleSpendDollars !== null) {
    const delta = data.totalSpendDollars - data.previousCycleSpendDollars;
    const pct =
      data.previousCycleSpendDollars > 0
        ? Math.round((delta / data.previousCycleSpendDollars) * 100)
        : 0;
    const arrow = delta >= 0 ? "↑" : "↓";
    facts.push({
      title: "vs Last Cycle",
      value: `$${data.previousCycleSpendDollars.toLocaleString()} (${delta >= 0 ? "+" : ""}${pct}% ${arrow})`,
    });
  }

  const utilizationPct =
    data.totalMembers > 0 ? Math.round((data.activeMembers / data.totalMembers) * 100) : 0;
  facts.push({
    title: "Seats",
    value: `${data.activeMembers}/${data.totalMembers} active (${utilizationPct}%)`,
  });

  if (data.unusedSeats > 0) {
    facts.push({ title: "Unused Seats", value: `⚠️ ${data.unusedSeats} unused this cycle` });
  }

  if (data.planExhausted.exhausted > 0) {
    facts.push({
      title: "Plan Exhaustion",
      value: `${data.planExhausted.exhausted}/${data.planExhausted.totalActive} users exceeded plan`,
    });
  }

  const a = data.adoptionTiers;
  facts.push({
    title: "Adoption",
    value: `AI-Native: ${a.aiNative} · High: ${a.high} · Moderate: ${a.moderate} · Low: ${a.low}`,
  });

  const body: AdaptiveElement[] = [
    {
      type: "TextBlock",
      text: `📊 Cursor Cycle Summary — Ending ${data.cycleEnd}`,
      size: "Large",
      weight: "Bolder",
      wrap: true,
    },
    { type: "FactSet", facts, spacing: "Medium" },
  ];

  if (data.topSpenders.length > 0) {
    body.push({
      type: "TextBlock",
      text: "**Top Spenders**",
      wrap: true,
      spacing: "Medium",
    });
    const topLines = data.topSpenders
      .slice(0, 5)
      .map((t, i) => `${i + 1}. ${t.name}: $${t.spendDollars.toLocaleString()}`);
    body.push({
      type: "TextBlock",
      text: topLines.join("\n\n"),
      wrap: true,
      spacing: "Small",
    });
  }

  body.push({
    type: "TextBlock",
    text: `Cycle ${data.cycleStart} – ${data.cycleEnd} · ${data.daysRemaining} days remaining · cursor-usage-tracker`,
    size: "Small",
    isSubtle: true,
    wrap: true,
    spacing: "Medium",
  });

  const actions: AdaptiveAction[] = [];
  if (options.dashboardUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "Dashboard",
      url: options.dashboardUrl,
    });
    actions.push({
      type: "Action.OpenUrl",
      title: "Insights",
      url: `${options.dashboardUrl}/insights`,
    });
  }

  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: ADAPTIVE_CARD_VERSION,
    body,
    ...(actions.length > 0 ? { actions } : {}),
    msteams: { width: "Full" },
  };

  return postToTeams(
    card,
    `Cursor Cycle Summary — $${data.totalSpendDollars.toLocaleString()} spend, ${data.unusedSeats} unused seats`,
  );
}

export async function sendCollectionErrorAlert(
  errors: string[],
  options: { dashboardUrl?: string } = {},
): Promise<boolean> {
  if (!isTeamsConfigured()) return false;

  const errorList = errors
    .slice(0, 10)
    .map((e) => `- ${e}`)
    .join("\n\n");

  const body: AdaptiveElement[] = [
    {
      type: "TextBlock",
      text: "❌ Cursor — Data Collection Errors",
      size: "Large",
      weight: "Bolder",
      color: "Attention",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: `**${errors.length} error${errors.length > 1 ? "s" : ""}** during scheduled collection:`,
      wrap: true,
      spacing: "Small",
    },
    {
      type: "TextBlock",
      text: errorList,
      wrap: true,
      spacing: "Small",
    },
    {
      type: "TextBlock",
      text: `${new Date().toISOString()} · cursor-usage-tracker`,
      size: "Small",
      isSubtle: true,
      wrap: true,
      spacing: "Medium",
    },
  ];

  const actions: AdaptiveAction[] = [];
  if (options.dashboardUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View dashboard",
      url: options.dashboardUrl,
    });
  }

  const card: AdaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: ADAPTIVE_CARD_VERSION,
    body,
    ...(actions.length > 0 ? { actions } : {}),
    msteams: { width: "Full" },
  };

  return postToTeams(
    card,
    `Cursor — ${errors.length} collection error${errors.length > 1 ? "s" : ""}: ${errors[0]}`,
  );
}
