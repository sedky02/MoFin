/**
 * Audience on web access tokens, required by JwtStrategy; MCP tokens carry the MCP resource URI
 * instead, so an MCP token can't be replayed on REST.
 */
export const WEB_AUDIENCE = 'mofin-web';
