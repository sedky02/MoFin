import type { ConnectedApp } from "@/core/types";

export type ConnectorKey = "claude" | "chatgpt" | "gemini" | "other";

const PATTERNS: [Exclude<ConnectorKey, "other">, RegExp][] = [
  ["claude", /claude|anthropic/i],
  ["chatgpt", /chatgpt|openai/i],
  ["gemini", /gemini|google/i],
];

export function connectorKeyFor(clientName: string | null): ConnectorKey {
  if (!clientName) return "other";
  return PATTERNS.find(([, pattern]) => pattern.test(clientName))?.[0] ?? "other";
}

export function connectedStates(apps: ConnectedApp[] | undefined): Partial<Record<ConnectorKey, "active" | "connected">> {
  const states: Partial<Record<ConnectorKey, "active" | "connected">> = {};
  for (const app of apps ?? []) {
    const key = connectorKeyFor(app.clientName);
    if (app.active) states[key] = "active";
    else if (!states[key]) states[key] = "connected";
  }
  return states;
}
