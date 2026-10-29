import type { ConnectedApp } from "@/lib/types";

export type ConnectorKey = "claude" | "chatgpt" | "gemini" | "other";

const PATTERNS: [Exclude<ConnectorKey, "other">, RegExp][] = [
  ["claude", /claude|anthropic/i],
  ["chatgpt", /chatgpt|openai/i],
  ["gemini", /gemini|google/i],
];

/** Which client card an app registered under this name belongs to ("other" when it matches none). */
export function connectorKeyFor(clientName: string | null): ConnectorKey {
  if (!clientName) return "other";
  return PATTERNS.find(([, pattern]) => pattern.test(clientName))?.[0] ?? "other";
}

/** The client cards that have an app connected, mapped to the strongest state: live access beats a stale consent. */
export function connectedStates(apps: ConnectedApp[] | undefined): Partial<Record<ConnectorKey, "active" | "connected">> {
  const states: Partial<Record<ConnectorKey, "active" | "connected">> = {};
  for (const app of apps ?? []) {
    const key = connectorKeyFor(app.clientName);
    if (app.active) states[key] = "active";
    else if (!states[key]) states[key] = "connected";
  }
  return states;
}
