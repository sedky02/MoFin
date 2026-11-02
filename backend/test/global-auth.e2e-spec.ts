/**
 * Secure-by-default authentication, through the real guards, decorators and
 * HTTP stack:
 * - CurrentUser answers 401 on a route that has no guard at all;
 * - the global GlobalJwtAuthGuard protects any route not marked @Public();
 * - the routes that must stay open (credentials, OAuth, discovery, health,
 *   MCP behind its own guard) still reach their handlers.
 *
 * Uses stub services and an in-memory config, so it needs no database and
 * runs with a plain `npm run test:e2e -- global-auth`.
 */
import {
  Controller,
  Get,
  INestApplication,
  RequestMethod,
  UseGuards,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import {
  IS_PUBLIC_KEY,
  Public,
} from '../src/common/decorators/public.decorator';
import {
  GlobalJwtAuthGuard,
  JwtAuthGuard,
} from '../src/common/guards/jwt-auth.guard';
import { OAuthMcpAuthGuard } from '../src/common/guards/oauth-mcp-auth.guard';
import { AuthenticatedUser } from '../src/common/types/authenticated-user';
import { PrismaService } from '../src/database/prisma.service';
import { HealthController } from '../src/health/health.controller';
import { WEB_AUDIENCE } from '../src/modules/auth/auth.constants';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { GoogleIdTokenVerifier } from '../src/modules/auth/id-token-verifier.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { McpServerFactory } from '../src/modules/mcp/mcp-server.factory';
import { McpController } from '../src/modules/mcp/mcp.controller';
import { OAuthController } from '../src/modules/oauth/oauth.controller';
import { OAuthService } from '../src/modules/oauth/oauth.service';
import { WellKnownController } from '../src/modules/oauth/well-known.controller';

const ISSUER = 'http://localhost:3000';
const ENV = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_MCP_SECRET: 'test-mcp-secret',
  OAUTH_ISSUER: ISSUER,
  WEB_URL: 'http://localhost:3001',
  OAUTH_SESSION_TTL: 600,
};

const jwt = new JwtService();
const webToken = (sub = 'user-1') =>
  jwt.sign(
    { sub, email: `${sub}@example.com` },
    { secret: ENV.JWT_ACCESS_SECRET, issuer: ISSUER, audience: WEB_AUDIENCE },
  );
const mcpToken = (sub = 'user-1') =>
  jwt.sign(
    { sub, email: `${sub}@example.com`, scope: 'mcp' },
    {
      secret: ENV.JWT_MCP_SECRET,
      issuer: ISSUER,
      audience: `${ISSUER}/api/v1/mcp`,
    },
  );

/** Stands in for a user-scoped service: records the userId it was asked for. */
const scopedService = { listFor: jest.fn((userId: string) => ({ userId })) };

@Controller('forgot-guard')
class ForgotGuardController {
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return scopedService.listFor(user.id);
  }
}

@Controller('unannotated')
class UnannotatedController {
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return scopedService.listFor(user.id);
  }
}

@Public()
@Controller('public-class')
class PublicClassController {
  @Get('open')
  open() {
    return { open: true };
  }

  // An explicit guard still runs under a controller-level @Public().
  @UseGuards(JwtAuthGuard)
  @Get('guarded')
  guarded(@CurrentUser() user: AuthenticatedUser) {
    return { userId: user.id };
  }
}

async function start(
  moduleRef: Awaited<
    ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
  >,
) {
  const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
  nestApp.set('trust proxy', 1);
  nestApp.setGlobalPrefix('api/v1', {
    exclude: [
      {
        path: '.well-known/oauth-protected-resource',
        method: RequestMethod.GET,
      },
      {
        path: '.well-known/oauth-protected-resource/(.*)',
        method: RequestMethod.GET,
      },
      {
        path: '.well-known/oauth-authorization-server',
        method: RequestMethod.GET,
      },
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/(.*)', method: RequestMethod.GET },
    ],
  });
  await nestApp.init();
  return nestApp as unknown as INestApplication<App>;
}

beforeEach(() => jest.clearAllMocks());

describe('CurrentUser on a route without any guard (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // No global JWT guard here: the route forgot its guard and nothing else catches it.
    const moduleRef = await Test.createTestingModule({
      controllers: [ForgotGuardController],
    }).compile();
    app = await start(moduleRef);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers 401, not 500 or data, and never calls the service', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/forgot-guard');
    expect(res.status).toBe(401);
    expect(scopedService.listFor).not.toHaveBeenCalled();
  });
});

describe('Global web JWT guard (e2e)', () => {
  let app: INestApplication<App>;
  const authService = {
    login: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    register: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    refreshTokens: jest.fn(async () => ({
      accessToken: 'a',
      refreshToken: 'r',
    })),
    logout: jest.fn(async () => ({ success: true })),
    loginWithGoogle: jest.fn(async () => ({
      accessToken: 'a',
      refreshToken: 'r',
    })),
  };
  const passwordResetService = {
    requestResetInBackground: jest.fn(),
    resetPassword: jest.fn(async () => ({ message: 'ok' })),
  };
  const oauthService = {
    issuer: ISSUER,
    authorizationServerMetadata: jest.fn(() => ({ issuer: ISSUER })),
    protectedResourceMetadata: jest.fn(() => ({
      resource: `${ISSUER}/api/v1/mcp`,
    })),
    revokeToken: jest.fn(async () => undefined),
    listGrants: jest.fn(async (userId: string) => [{ userId }]),
    resolveSession: jest.fn(async () => null),
    getClientOrThrow: jest.fn(async () => ({ redirectUris: [] })),
  };
  const mcpFactory = { create: jest.fn() };
  const prisma = { $queryRaw: jest.fn(async () => [1]) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [
        UnannotatedController,
        PublicClassController,
        AuthController,
        OAuthController,
        WellKnownController,
        McpController,
        HealthController,
      ],
      providers: [
        // Same order as AppModule.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
        { provide: ConfigService, useValue: new ConfigService(ENV) },
        { provide: JwtService, useValue: jwt },
        JwtStrategy,
        OAuthMcpAuthGuard,
        { provide: AuthService, useValue: authService },
        { provide: PasswordResetService, useValue: passwordResetService },
        { provide: GoogleIdTokenVerifier, useValue: {} },
        { provide: OAuthService, useValue: oauthService },
        { provide: McpServerFactory, useValue: mcpFactory },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = await start(moduleRef);
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  describe('a new route with no annotation', () => {
    it('is closed without a token', async () => {
      await http().get('/api/v1/unannotated').expect(401);
      expect(scopedService.listFor).not.toHaveBeenCalled();
    });

    it('is closed with a bad or MCP token', async () => {
      await http()
        .get('/api/v1/unannotated')
        .auth('not-a-jwt', { type: 'bearer' })
        .expect(401);
      await http()
        .get('/api/v1/unannotated')
        .auth(mcpToken(), { type: 'bearer' })
        .expect(401);
      expect(scopedService.listFor).not.toHaveBeenCalled();
    });

    it('serves the caller with a web token, scoped to their id', async () => {
      const res = await http()
        .get('/api/v1/unannotated')
        .auth(webToken('user-7'), { type: 'bearer' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userId: 'user-7' });
    });
  });

  describe('@Public()', () => {
    it('opens a route on a public controller', async () => {
      await http().get('/api/v1/public-class/open').expect(200, { open: true });
    });

    it('does not cancel an explicit JwtAuthGuard on one of its methods', async () => {
      await http().get('/api/v1/public-class/guarded').expect(401);
      await http()
        .get('/api/v1/public-class/guarded')
        .auth(webToken(), { type: 'bearer' })
        .expect(200);
    });
  });

  describe('real public routes reach their handlers without a token', () => {
    it.each([
      [
        'login',
        { email: 'a@example.com', password: 'whatever' },
        201,
        () => authService.login,
      ],
      [
        'register',
        { email: 'a@example.com', password: 'long-enough' },
        201,
        () => authService.register,
      ],
      ['refresh', { refreshToken: 'r' }, 201, () => authService.refreshTokens],
      ['logout', { refreshToken: 'r' }, 201, () => authService.logout],
      [
        'password/forgot',
        { email: 'a@example.com' },
        202,
        () => passwordResetService.requestResetInBackground,
      ],
      [
        'password/reset',
        { token: 't', password: 'new-password' },
        200,
        () => passwordResetService.resetPassword,
      ],
    ])('POST /auth/%s', async (path, body, status, handler) => {
      await http().post(`/api/v1/auth/${path}`).send(body).expect(status);
      expect(handler()).toHaveBeenCalled();
    });

    it('POST /oauth/revoke', async () => {
      await http()
        .post('/api/v1/oauth/revoke')
        .send({ token: 'x' })
        .expect(200);
      expect(oauthService.revokeToken).toHaveBeenCalledWith('x');
    });

    it('GET /oauth/authorize renders its own error page', async () => {
      const res = await http().get('/api/v1/oauth/authorize');
      expect(res.status).toBe(400);
      expect(res.type).toBe('text/html');
    });

    it.each([
      'oauth-authorization-server',
      'oauth-protected-resource',
      'oauth-protected-resource/api/v1/mcp',
    ])('GET /.well-known/%s', async (path) => {
      await http().get(`/.well-known/${path}`).expect(200);
    });

    it.each(['/health', '/health/ready'])('GET %s', async (path) => {
      await http().get(path).expect(200, { status: 'ok' });
    });
  });

  describe('protected real routes', () => {
    it('GET /auth/me needs a web token', async () => {
      await http().get('/api/v1/auth/me').expect(401);
      await http()
        .get('/api/v1/auth/me')
        .auth(webToken('user-3'), { type: 'bearer' })
        .expect(200, { id: 'user-3', email: 'user-3@example.com' });
    });

    it('GET /oauth/grants needs a web token', async () => {
      await http().get('/api/v1/oauth/grants').expect(401);
      await http()
        .get('/api/v1/oauth/grants')
        .auth(webToken('user-4'), { type: 'bearer' })
        .expect(200);
      expect(oauthService.listGrants).toHaveBeenCalledWith('user-4');
    });
  });

  describe('MCP routes keep their own OAuth guard, without the web JWT', () => {
    it('challenges a request without a token through OAuthMcpAuthGuard', async () => {
      const res = await http().get('/api/v1/mcp');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain('resource_metadata=');
    });

    it('rejects a web token', async () => {
      await http()
        .get('/api/v1/mcp')
        .auth(webToken(), { type: 'bearer' })
        .expect(401);
    });

    it('lets an MCP token through to the handler', async () => {
      await http()
        .get('/api/v1/mcp')
        .auth(mcpToken(), { type: 'bearer' })
        .expect(405);
    });
  });
});

describe('Public routes across every controller', () => {
  /**
   * The whole list of routes that skip the global web JWT guard. Adding a
   * public route means adding it here, on purpose.
   */
  const EXPECTED_PUBLIC = [
    'GET /.well-known/oauth-authorization-server',
    'GET /.well-known/oauth-protected-resource',
    'GET /.well-known/oauth-protected-resource/*',
    'GET /health',
    'GET /health/ready',
    'GET /mcp',
    'DELETE /mcp',
    'POST /mcp',
    'POST /auth/register',
    'POST /auth/login',
    'POST /auth/refresh',
    'POST /auth/password/forgot',
    'POST /auth/password/reset',
    'POST /auth/logout',
    'POST /auth/google',
    'POST /auth/google/id-token',
    'POST /auth/demo',
    'POST /oauth/register',
    'GET /oauth/authorize',
    'POST /oauth/consent',
    'POST /oauth/token',
    'POST /oauth/revoke',
    'POST /oauth/session/handoff',
    'GET /oauth/session/consume',
  ];

  const srcRoot = join(__dirname, '..', 'src');

  function controllerFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return controllerFiles(path);
      return name.endsWith('.controller.ts') ? [path] : [];
    });
  }

  function routes() {
    const reflector = new Reflector();
    const found: {
      route: string;
      isPublic: boolean;
      controller: Function;
      file: string;
    }[] = [];
    for (const file of controllerFiles(srcRoot)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const exports = require(file) as Record<string, unknown>;
      for (const controller of Object.values(exports)) {
        if (
          typeof controller !== 'function' ||
          Reflect.getMetadata(PATH_METADATA, controller) === undefined
        )
          continue;
        const base = String(
          Reflect.getMetadata(PATH_METADATA, controller),
        ).replace(/^\/|\/$/g, '');
        for (const name of Object.getOwnPropertyNames(controller.prototype)) {
          const handler = (controller.prototype as Record<string, unknown>)[
            name
          ];
          if (typeof handler !== 'function' || name === 'constructor') continue;
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as
            | RequestMethod
            | undefined;
          if (method === undefined) continue;
          const sub = String(
            Reflect.getMetadata(PATH_METADATA, handler),
          ).replace(/^\/|\/$/g, '');
          const path =
            ['', base, sub].filter((p, i) => i === 0 || p).join('/') || '/';
          const isPublic =
            reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
              handler,
              controller,
            ]) === true;
          found.push({
            route: `${RequestMethod[method]} ${path}`,
            isPublic,
            controller,
            file: relative(srcRoot, file),
          });
        }
      }
    }
    return found;
  }

  it('marks exactly the expected routes @Public()', () => {
    const publicRoutes = routes()
      .filter((r) => r.isPublic)
      .map((r) => r.route);
    expect(publicRoutes.sort()).toEqual([...EXPECTED_PUBLIC].sort());
  });

  it('leaves every other route protected by default', () => {
    const protectedRoutes = routes().filter((r) => !r.isPublic);
    // Spot-check the user-scoped families; the exact list above already pins the rest.
    expect(protectedRoutes.map((r) => r.route)).toEqual(
      expect.arrayContaining([
        'GET /auth/me',
        'POST /auth/password/change',
        'POST /auth/sessions/revoke-all',
        'DELETE /users/me',
        'GET /oauth/grants',
        'DELETE /oauth/grants/:clientId',
        'GET /accounts',
        'POST /transactions',
      ]),
    );
  });

  it('keeps OAuthMcpAuthGuard on the public MCP routes', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      McpController,
    ) as unknown[];
    expect(guards).toContain(OAuthMcpAuthGuard);
  });

  it('keeps the data export protected', () => {
    const exportRoutes = routes().filter((r) => r.route === 'GET /export');
    expect(exportRoutes).toHaveLength(1);
    expect(exportRoutes[0].isPublic).toBe(false);
  });
});
