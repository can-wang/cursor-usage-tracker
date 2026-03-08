import { Resend } from "resend";
import type { Anomaly, Incident } from "../types";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function buildHtml(anomaly: Anomaly, incident: Incident, dashboardUrl?: string): string {
  const severityColor = anomaly.severity === "critical" ? "#dc2626" : "#f59e0b";
  const linkHtml = dashboardUrl
    ? `<p style="margin-top:16px"><a href="${dashboardUrl}/users/${encodeURIComponent(anomaly.userEmail)}">View user details</a> · <a href="${dashboardUrl}/anomalies">All anomalies</a></p>`
    : "";

  return `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:${severityColor};color:white;padding:16px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">Cursor Usage Alert — ${anomaly.severity.toUpperCase()}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:16px;border-radius:0 0 8px 8px">
        <p style="font-size:16px;font-weight:600">${anomaly.message}</p>
        ${linkHtml}
        <p style="margin-top:16px;color:#9ca3af;font-size:12px">Incident #${incident.id} · ${anomaly.detectedAt} · cursor-usage-tracker</p>
      </div>
    </div>
  `;
}

export async function sendEmailAlert(
  anomaly: Anomaly,
  incident: Incident,
  options: { to?: string; dashboardUrl?: string } = {},
): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn("[email] Skipping alert — missing RESEND_API_KEY");
    return false;
  }

  const to = options.to ?? process.env.ALERT_EMAIL_TO;
  if (!to) {
    console.warn("[email] Skipping alert — missing ALERT_EMAIL_TO");
    return false;
  }

  const from = process.env.RESEND_FROM ?? "Cursor Tracker <alerts@resend.dev>";
  const severityPrefix = anomaly.severity === "critical" ? "[CRITICAL]" : "[WARNING]";

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `${severityPrefix} ${anomaly.message}`,
      html: buildHtml(anomaly, incident, options.dashboardUrl),
    });
    if (error) {
      console.error("[email] Resend API error:", error.message);
      return false;
    }
    console.log(`[email] Alert sent to ${to} for ${anomaly.userEmail}`);
    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err instanceof Error ? err.message : err);
    return false;
  }
}
