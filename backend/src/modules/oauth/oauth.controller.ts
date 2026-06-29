import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  authorizeQuerySchema,
  consentBodySchema,
  registerClientSchema,
  tokenBodySchema,
} from './dto/oauth.dto';
import { OAuthService } from './oauth.service';

const SESSION_COOKIE = 'mofin_as_session';
const SESSION_COOKIE_PATH = '/api/v1/oauth';

@ApiExcludeController()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly config: ConfigService,
  ) {}

  // --- Dynamic Client Registration ---

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() body: unknown, @Res() res: Response) {
    const dto = registerClientSchema.parse(body);
    const client = await this.oauth.registerClient(dto);
    res.status(201).json(client);
  }

  // --- Authorization endpoint ---

  @Get('authorize')
  async authorize(@Req() req: Request, @Res() res: Response) {
    const parsed = authorizeQuerySchema.safeParse(req.query);

    // Before redirect_uri is validated we cannot safely redirect, so render HTML.
    if (!parsed.success) {
      const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : undefined;
      const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
      if (clientId && redirectUri) {
        const client = await this.oauth.getClientOrThrow(clientId).catch(() => null);
        if (client?.redirectUris.includes(redirectUri)) {
          // redirect_uri is trusted → return the error to the client per RFC 6749.
          return this.redirectError(res, redirectUri, 'invalid_request', String(req.query.state ?? ''));
        }
      }
      return this.renderError(res, 'Invalid authorization request.');
    }

    const q = parsed.data;
    const client = await this.oauth.getClientOrThrow(q.client_id).catch(() => null);
    if (!client) return this.renderError(res, 'Unknown client.');
    if (!client.redirectUris.includes(q.redirect_uri)) {
      return this.renderError(res, 'redirect_uri does not match a registered URI.');
    }

    // redirect_uri now trusted — protocol violations go back to the client.
    if (q.response_type !== 'code') {
      return this.redirectError(res, q.redirect_uri, 'unsupported_response_type', q.state);
    }
    if (q.code_challenge_method !== 'S256') {
      return this.redirectError(res, q.redirect_uri, 'invalid_request', q.state);
    }

    // Authenticate the end user via the backend session cookie.
    const user = await this.oauth.resolveSession(getCookie(req, SESSION_COOKIE));
    if (!user) {
      // Start the cross-origin login bridge: send the user to the web login,
      // carrying the full authorize URL so we return here afterwards.
      const authorizeUrl = `${this.oauth.issuer}/api/v1/oauth/authorize?${queryString(req)}`;
      const webUrl = this.config.getOrThrow<string>('WEB_URL').replace(/\/$/, '');
      const loginUrl = `${webUrl}/login?mcp_authorize=${encodeURIComponent(authorizeUrl)}`;
      return res.redirect(loginUrl);
    }

    // Skip consent if the user already granted this client.
    if (await this.oauth.hasGrant(user.id, q.client_id)) {
      const code = await this.oauth.issueAuthorizationCode(user.id, q);
      return this.redirectSuccess(res, q.redirect_uri, code, q.state);
    }

    return this.renderConsent(res, q, client.clientName ?? q.client_id, user.email);
  }

  @Post('consent')
  async consent(@Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    const dto = consentBodySchema.parse(body);

    // SameSite=Lax on the session cookie already blocks cross-site POSTs; we also
    // re-resolve the session here so consent can never be granted unauthenticated.
    const user = await this.oauth.resolveSession(getCookie(req, SESSION_COOKIE));
    if (!user) throw new UnauthorizedException('no session');

    const client = await this.oauth.getClientOrThrow(dto.client_id);
    if (!client.redirectUris.includes(dto.redirect_uri)) {
      return this.renderError(res, 'redirect_uri does not match a registered URI.');
    }

    if (dto.decision === 'deny') {
      return this.redirectError(res, dto.redirect_uri, 'access_denied', dto.state);
    }

    await this.oauth.rememberGrant(user.id, dto.client_id, dto.scope ?? 'mcp');
    const code = await this.oauth.issueAuthorizationCode(user.id, dto);
    return this.redirectSuccess(res, dto.redirect_uri, code, dto.state);
  }

  // --- Token endpoint ---

  @Post('token')
  async token(@Body() body: unknown, @Res() res: Response) {
    const dto = tokenBodySchema.parse(body);

    if (dto.grant_type === 'authorization_code') {
      if (!dto.code || !dto.code_verifier || !dto.client_id || !dto.redirect_uri) {
        throw new BadRequestException({ error: 'invalid_request' });
      }
      const tokens = await this.oauth.exchangeAuthorizationCode({
        code: dto.code,
        codeVerifier: dto.code_verifier,
        clientId: dto.client_id,
        redirectUri: dto.redirect_uri,
      });
      return res.status(200).json(tokens);
    }

    if (dto.grant_type === 'refresh_token') {
      if (!dto.refresh_token || !dto.client_id) {
        throw new BadRequestException({ error: 'invalid_request' });
      }
      const tokens = await this.oauth.exchangeRefreshToken({
        refreshToken: dto.refresh_token,
        clientId: dto.client_id,
      });
      return res.status(200).json(tokens);
    }

    throw new BadRequestException({ error: 'unsupported_grant_type' });
  }

  // --- Cross-origin login bridge ---

  @Post('session/handoff')
  async handoff(@Headers('authorization') authorization: string | undefined, @Res() res: Response) {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('missing bearer token');
    const handoff = await this.oauth.createHandoff(token);
    res.status(201).json({ handoff });
  }

  @Get('session/consume')
  async consume(
    @Query('handoff') handoff: string,
    @Query('continue') cont: string,
    @Res() res: Response,
  ) {
    if (!handoff || !cont) throw new BadRequestException('missing handoff/continue');

    const sessionValue = await this.oauth.consumeHandoff(handoff);

    const secure = this.oauth.issuer.startsWith('https://');
    res.cookie(SESSION_COOKIE, sessionValue, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: SESSION_COOKIE_PATH,
      maxAge: this.config.getOrThrow<number>('OAUTH_SESSION_TTL') * 1000,
    });

    // Anti open-redirect: only continue to our own authorize endpoint.
    const authorizePrefix = `${this.oauth.issuer}/api/v1/oauth/authorize`;
    if (!cont.startsWith(authorizePrefix)) {
      return this.renderError(res, 'Invalid continuation target.');
    }
    return res.redirect(cont);
  }

  // --- HTML / redirect helpers ---

  private redirectSuccess(res: Response, redirectUri: string, code: string, state: string) {
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    url.searchParams.set('state', state);
    return res.redirect(url.toString());
  }

  private redirectError(res: Response, redirectUri: string, error: string, state: string) {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    if (state) url.searchParams.set('state', state);
    return res.redirect(url.toString());
  }

  private renderError(res: Response, message: string) {
    res.status(400).type('html').send(page(`
      <h1>Authorization error</h1>
      <p class="muted">${escapeHtml(message)}</p>
    `));
  }

  private renderConsent(
    res: Response,
    q: { client_id: string; redirect_uri: string; code_challenge: string; code_challenge_method: string; state: string; scope?: string; resource?: string; response_type: string },
    clientName: string,
    email: string,
  ) {
    const hidden = (name: string, value: string) =>
      `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`;
    res.status(200).type('html').send(page(`
      <h1>Authorize <span class="accent">${escapeHtml(clientName)}</span></h1>
      <p class="muted">Signed in as <strong>${escapeHtml(email)}</strong></p>
      <p class="muted">This connector is requesting access to:</p>
      <ul><li><code>${escapeHtml(q.scope ?? 'mcp')}</code> — read and act on your MoFin data via MCP tools</li></ul>
      <form method="post" action="/api/v1/oauth/consent">
        ${hidden('response_type', q.response_type)}
        ${hidden('client_id', q.client_id)}
        ${hidden('redirect_uri', q.redirect_uri)}
        ${hidden('code_challenge', q.code_challenge)}
        ${hidden('code_challenge_method', q.code_challenge_method)}
        ${hidden('state', q.state)}
        ${hidden('scope', q.scope ?? 'mcp')}
        ${q.resource ? hidden('resource', q.resource) : ''}
        <div class="actions">
          <button type="submit" name="decision" value="approve" class="primary">Approve</button>
          <button type="submit" name="decision" value="deny" class="ghost">Deny</button>
        </div>
      </form>
    `));
  }
}

// --- small request/HTML utilities (no extra dependencies) ---

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function queryString(req: Request): string {
  const i = req.url.indexOf('?');
  return i === -1 ? '' : req.url.slice(i + 1);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MoFin — Authorize</title>
  <style>
    :root { color-scheme: dark; }
    body { background:#050505; color:#e5e2e1; font-family: ui-sans-serif, system-ui, sans-serif;
      display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    main { width:min(440px, 92vw); padding:32px; border:1px solid #1f1f1f; border-radius:16px;
      background:#0d0d0d; }
    h1 { font-size:22px; margin:0 0 12px; }
    .accent { color:#d2f000; }
    .muted { color:#8a8a8a; font-size:14px; }
    ul { font-size:14px; padding-left:18px; }
    code { color:#d2f000; }
    .actions { display:flex; gap:12px; margin-top:24px; }
    button { flex:1; padding:12px; border-radius:10px; font-size:14px; cursor:pointer; border:1px solid #2a2a2a; }
    .primary { background:#d2f000; color:#050505; border:none; font-weight:600; }
    .ghost { background:transparent; color:#e5e2e1; }
  </style></head><body><main>${body}</main></body></html>`;
}
