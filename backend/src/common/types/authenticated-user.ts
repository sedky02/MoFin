export interface AuthenticatedUser {
  id: string;
  email: string;
  /** On MCP requests only: the OAuth client (the connected AI app) the token was issued to. */
  clientId?: string;
}
