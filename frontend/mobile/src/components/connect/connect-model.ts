// The connect page's data, as on the web: the connector name, the deep link that opens Claude with
// the URL filled in, ChatGPT's settings page and the Gemini CLI config. The web reads the connector
// URL from NEXT_PUBLIC_MCP_URL (the backend's /api/v1/mcp); the app derives the same URL from its
// API base so there is no second value to keep in step.

export const CONNECTOR_NAME = 'MoFin — Monitor your Finances';
export const CHATGPT_SETTINGS_URL = 'https://chatgpt.com/#settings/Connectors';
export const NOT_AVAILABLE = "The AI connector isn't available on this server yet.";
export const DEMO_UNAVAILABLE =
  "Connecting an AI app isn't available in the demo. Create your own account to connect Claude, ChatGPT or Gemini to your data.";

export const CLIENTS = [
  { key: 'claude', label: 'Claude', hint: 'Web, desktop and mobile' },
  { key: 'chatgpt', label: 'ChatGPT', hint: 'Custom connectors' },
  { key: 'gemini', label: 'Gemini', hint: 'Gemini CLI' },
  { key: 'other', label: 'Other', hint: 'Any remote MCP client' },
] as const;

export type ClientKey = (typeof CLIENTS)[number]['key'];

/** The remote MCP endpoint for an API base such as https://host/api/v1. Empty when there is no base. */
export function mcpUrlFor(apiUrl: string | undefined): string {
  const base = (apiUrl ?? '').replace(/\/+$/, '');
  return base ? `${base}/mcp` : '';
}

export function claudeDeepLink(mcpUrl: string): string {
  return mcpUrl
    ? `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(
        CONNECTOR_NAME,
      )}&connectorUrl=${encodeURIComponent(mcpUrl)}`
    : '';
}

export function geminiCliConfig(mcpUrl: string): string {
  return JSON.stringify({ mcpServers: { mofin: { url: mcpUrl } } }, null, 2);
}

/** Why the connector can't be used right now, or null when it can. */
export function unavailableMessage(mcpUrl: string, isDemo: boolean | undefined): string | null {
  if (isDemo) return DEMO_UNAVAILABLE;
  return mcpUrl ? null : NOT_AVAILABLE;
}

/** The status line under the client header for a connected app. */
export function connectedMessage(state: 'active' | 'connected', appName: string): string {
  return state === 'active'
    ? `${appName} is connected to your account.`
    : `${appName} was approved but isn't signed in right now. Add it again to reconnect.`;
}
