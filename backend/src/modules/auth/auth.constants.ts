/**
 * Audience claim stamped on first-party web access tokens and required by
 * JwtStrategy. MCP/OAuth tokens carry the MCP resource URI as their audience
 * instead, so this alone rejects an MCP token replayed against REST endpoints.
 */
export const WEB_AUDIENCE = 'mofin-web';
