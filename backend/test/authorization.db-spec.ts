/**
 * Who can do what on a shared account, through the real app: every route that
 * touches an account, and every MCP and chat tool, as the owner, an editor, a
 * viewer and someone with no access. Runs the full AppModule against Postgres.
 * Needs TEST_DATABASE_URL (see support/test-database.ts).
 *
 * A new route fails the coverage check below until it is listed here, or
 * listed as not touching accounts, with the reason.
 */
import { INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { DraftSource, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { CHAT_MCP_TOOLS } from '../src/modules/ai/ai-chat-tools';
import { CHART_TOOL_NAMES } from '../src/modules/ai/chat/chart-tools';
import { ChatToolRunner } from '../src/modules/ai/chat/chat-tool-runner';
import { OwnershipService } from '../src/modules/account-sharing/ownership.service';
import { WEB_AUDIENCE } from '../src/modules/auth/auth.constants';
import { MailMessage, MailSender } from '../src/modules/mail/mail-sender';
import { McpToolName } from '../src/modules/mcp/dto/mcp.dto';
import { MCP_TOOLS } from '../src/modules/mcp/mcp-tools';
import { McpService } from '../src/modules/mcp/mcp.service';
import { RecurringTransactionsCron } from '../src/modules/transactions/recurring-transactions.cron';
import { HIDDEN_ACCOUNT_NAME } from '../src/modules/transactions/transaction-view';

class QuietMail extends MailSender {
  sent: MailMessage[] = [];
  send(message: MailMessage) {
    this.sent.push(message);
    return Promise.resolve();
  }
}

const ROLES = ['owner', 'editor', 'viewer', 'stranger'] as const;
type Role = (typeof ROLES)[number];
type Outcome = 'ok' | 403 | 404;
type Expected = [Outcome, Outcome, Outcome, Outcome];

const ANYONE: Expected = ['ok', 'ok', 'ok', 'ok'];
const READ: Expected = ['ok', 'ok', 'ok', 404];
const WRITE: Expected = ['ok', 'ok', 403, 404];
const MANAGE: Expected = ['ok', 403, 403, 404];
const LEAVE: Expected = [403, 'ok', 'ok', 404];

const D = (value: string | number) => new Prisma.Decimal(value);
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH = NOW.getUTCMonth() + 1;

describe('Authorization on shared accounts (Postgres)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mcp: McpService;
  let chat: ChatToolRunner;
  let jwt: JwtService;
  let config: ConfigService;
  const userIds: string[] = [];

  async function user(name: string) {
    const id = randomUUID();
    userIds.push(id);
    await prisma.user.create({
      data: {
        id,
        email: `${name}-${id}@example.com`,
        displayName: name,
        emailVerifiedAt: new Date(),
      },
    });
    return id;
  }

  const account = (userId: string, name: string, archived = false) =>
    prisma.account.create({
      data: {
        userId,
        name,
        type: 'BANK',
        currency: 'EUR',
        archivedAt: archived ? new Date() : null,
      },
    });

  const leg = (
    userId: string,
    accountId: string,
    direction: 'DEBIT' | 'CREDIT',
    amount = 10,
  ) => ({ userId, accountId, direction, amount: D(amount), currency: 'EUR' });

  const expense = (
    userId: string,
    accountId: string,
    data: Partial<Prisma.TransactionUncheckedCreateInput> = {},
    amount = 10,
  ) =>
    prisma.transaction.create({
      data: {
        userId,
        createdById: userId,
        type: 'EXPENSE',
        description: 'Groceries',
        currency: 'EUR',
        occurredAt: NOW,
        ...data,
        items: { create: leg(userId, accountId, 'DEBIT', amount) },
      },
    });

  const series = (
    userId: string,
    accountId: string,
    status: 'ACTIVE' | 'PAUSED',
  ) =>
    expense(userId, accountId, {
      isRecurring: true,
      recurringInterval: 'MONTHLY',
      recurringStatus: status,
      recurringAmount: D(10),
      recurringFromAccountId: accountId,
      nextOccurrenceAt: new Date(NOW.getTime() + 86_400_000),
    });

  const goal = (userId: string, accountId: string, archived = false) =>
    prisma.goal.create({
      data: {
        userId,
        accountId,
        name: 'Holiday',
        type: 'BALANCE',
        targetAmount: D(100),
        periodStart: new Date(`${TODAY}T00:00:00Z`),
        periodEnd: new Date(`${YEAR + 1}-01-01T00:00:00Z`),
        archivedAt: archived ? new Date() : null,
        instances: {
          create: {
            periodStart: new Date(`${TODAY}T00:00:00Z`),
            periodEnd: new Date(`${YEAR + 1}-01-01T00:00:00Z`),
            targetAmount: D(100),
          },
        },
      },
    });

  const draftFields = (accountId: string) => ({
    type: 'EXPENSE' as const,
    description: 'Coffee',
    amount: '3',
    currency: 'EUR',
    occurredAt: TODAY,
    fromAccountId: accountId,
  });

  /** A shared account with one of everything on it, and four people. */
  async function world() {
    const people = {
      owner: await user('owner'),
      editor: await user('editor'),
      viewer: await user('viewer'),
      stranger: await user('stranger'),
    };
    const shared = await account(people.owner, 'Joint');
    const closed = await account(people.owner, 'Closed', true);
    const privateAccount = await account(people.owner, 'Secret savings');
    for (const { id } of [shared, closed]) {
      await prisma.accountMember.createMany({
        data: [
          { accountId: id, userId: people.editor, role: 'EDITOR' },
          { accountId: id, userId: people.viewer, role: 'VIEWER' },
        ],
      });
    }
    const transaction = await expense(people.owner, shared.id);
    const deleted = await expense(people.owner, shared.id, {
      deletedAt: new Date(),
    });
    const root = await series(people.owner, shared.id, 'ACTIVE');
    const paused = await series(people.owner, shared.id, 'PAUSED');
    const openGoal = await goal(people.owner, shared.id);
    const endedGoal = await goal(people.owner, shared.id, true);
    const invitation = await prisma.accountInvitation.create({
      data: {
        accountId: shared.id,
        invitedById: people.owner,
        email: `invited-${randomUUID()}@example.com`,
        role: 'VIEWER',
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const drafts = {} as Record<Role, string>;
    for (const role of ROLES) {
      const { id } = await prisma.draftTransaction.create({
        data: {
          userId: people[role],
          rawInput: 'coffee 3',
          parsedData: draftFields(shared.id),
          confidenceScore: D('0.9'),
        },
      });
      drafts[role] = id;
    }
    return {
      people,
      shared: shared.id,
      closed: closed.id,
      privateAccount: privateAccount.id,
      transaction: transaction.id,
      deleted: deleted.id,
      root: root.id,
      paused: paused.id,
      goal: openGoal.id,
      endedGoal: endedGoal.id,
      invitation: invitation.id,
      drafts,
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

  function client(userId: string) {
    const token = jwt.sign(
      { sub: userId, email: `${userId}@example.com` },
      {
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: config.getOrThrow<string>('OAUTH_ISSUER'),
        audience: WEB_AUDIENCE,
      },
    );
    const http = request(app.getHttpServer());
    const call =
      (method: 'get' | 'post' | 'patch' | 'delete') =>
      (path: string, body?: object) => {
        const req = http[method](`/api/v1${path}`).auth(token, {
          type: 'bearer',
        });
        return body ? req.send(body) : req;
      };
    return {
      get: call('get'),
      post: call('post'),
      patch: call('patch'),
      delete: call('delete'),
    };
  }
  type Client = ReturnType<typeof client>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailSender)
      .useValue(new QuietMail())
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    mcp = app.get(McpService, { strict: false });
    chat = app.get(ChatToolRunner, { strict: false });
    jwt = new JwtService();
    config = app.get(ConfigService);
  });

  afterAll(async () => {
    await prisma.transactionItem.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.transaction.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('is running against the test database', async () => {
    const [{ current_database: name }] = await prisma.$queryRaw<
      { current_database: string }[]
    >`SELECT current_database()`;
    expect(name.endsWith('_test')).toBe(true);
  });

  const newTransaction = (accountId: string) => ({
    type: 'EXPENSE',
    description: 'Lunch',
    amount: '12',
    currency: 'EUR',
    occurredAt: NOW.toISOString(),
    fromAccountId: accountId,
  });

  /** Every route that reaches an account, and what each role gets from it. */
  const ROUTES: Record<
    string,
    {
      expected: Expected;
      send: (as: Client, w: World, role: Role) => request.Test;
    }
  > = {
    'POST /accounts': {
      expected: ANYONE,
      send: (as) =>
        as.post('/accounts', { name: 'New', type: 'CASH', currency: 'EUR' }),
    },
    'GET /accounts': { expected: ANYONE, send: (as) => as.get('/accounts') },
    'GET /accounts/shared/owned': {
      expected: ANYONE,
      send: (as) => as.get('/accounts/shared/owned'),
    },
    'PATCH /accounts/:id': {
      expected: MANAGE,
      send: (as, w) => as.patch(`/accounts/${w.shared}`, { name: 'Renamed' }),
    },
    'DELETE /accounts/:id': {
      expected: MANAGE,
      send: (as, w) => as.delete(`/accounts/${w.shared}`),
    },
    'PATCH /accounts/:id/restore': {
      expected: MANAGE,
      send: (as, w) => as.patch(`/accounts/${w.closed}/restore`),
    },
    'GET /accounts/:id/members': {
      expected: READ,
      send: (as, w) => as.get(`/accounts/${w.shared}/members`),
    },
    'DELETE /accounts/:id/members/me': {
      expected: LEAVE,
      send: (as, w) => as.delete(`/accounts/${w.shared}/members/me`),
    },
    'PATCH /accounts/:id/members/:userId': {
      expected: MANAGE,
      send: (as, w) =>
        as.patch(`/accounts/${w.shared}/members/${w.people.viewer}`, {
          role: 'EDITOR',
        }),
    },
    'DELETE /accounts/:id/members/:userId': {
      expected: MANAGE,
      send: (as, w) =>
        as.delete(`/accounts/${w.shared}/members/${w.people.viewer}`),
    },
    'PATCH /accounts/:id/preferences': {
      expected: READ,
      send: (as, w) =>
        as.patch(`/accounts/${w.shared}/preferences`, { hideAmount: true }),
    },
    'POST /accounts/:id/transfer-ownership': {
      expected: MANAGE,
      send: (as, w) =>
        as.post(`/accounts/${w.shared}/transfer-ownership`, {
          newOwnerId: w.people.editor,
        }),
    },
    'POST /accounts/:id/invitations': {
      expected: MANAGE,
      send: (as, w) =>
        as.post(`/accounts/${w.shared}/invitations`, {
          email: 'friend@example.com',
          role: 'VIEWER',
        }),
    },
    'GET /accounts/:id/invitations': {
      expected: MANAGE,
      send: (as, w) => as.get(`/accounts/${w.shared}/invitations`),
    },
    'DELETE /accounts/:id/invitations/:invitationId': {
      expected: MANAGE,
      send: (as, w) =>
        as.delete(`/accounts/${w.shared}/invitations/${w.invitation}`),
    },
    'GET /ledger/balance': {
      expected: READ,
      send: (as, w) => as.get(`/ledger/balance?accountId=${w.shared}`),
    },
    'GET /search/transactions': {
      expected: READ,
      send: (as, w) => as.get(`/search/transactions?accountId=${w.shared}`),
    },
    'GET /analytics/monthly-summary': {
      expected: READ,
      send: (as, w) =>
        as.get(
          `/analytics/monthly-summary?year=${YEAR}&month=${MONTH}&accountId=${w.shared}`,
        ),
    },
    'GET /analytics/monthly-series': {
      expected: READ,
      send: (as, w) =>
        as.get(
          `/analytics/monthly-series?months=3&currency=EUR&accountId=${w.shared}`,
        ),
    },
    'GET /analytics/daily-series': {
      expected: READ,
      send: (as, w) =>
        as.get(
          `/analytics/daily-series?from=${TODAY}&days=7&currency=EUR&accountId=${w.shared}`,
        ),
    },
    'GET /categories': {
      expected: READ,
      send: (as, w) => as.get(`/categories?accountId=${w.shared}`),
    },
    'POST /goals': {
      expected: WRITE,
      send: (as, w) =>
        as.post('/goals', {
          accountId: w.shared,
          name: 'New car',
          type: 'BALANCE',
          targetAmount: '500',
          isRecurring: false,
          periodStart: TODAY,
          periodEnd: `${YEAR + 1}-06-30`,
        }),
    },
    'GET /goals': { expected: ANYONE, send: (as) => as.get('/goals') },
    'GET /goals/:id': {
      expected: READ,
      send: (as, w) => as.get(`/goals/${w.goal}`),
    },
    'GET /goals/:id/history': {
      expected: READ,
      send: (as, w) => as.get(`/goals/${w.goal}/history`),
    },
    'PATCH /goals/:id': {
      expected: WRITE,
      send: (as, w) => as.patch(`/goals/${w.goal}`, { name: 'Renamed' }),
    },
    'DELETE /goals/:id': {
      expected: WRITE,
      send: (as, w) => as.delete(`/goals/${w.goal}`),
    },
    'PATCH /goals/:id/restore': {
      expected: WRITE,
      send: (as, w) => as.patch(`/goals/${w.endedGoal}/restore`),
    },
    'POST /transactions': {
      expected: WRITE,
      send: (as, w) => as.post('/transactions', newTransaction(w.shared)),
    },
    'GET /transactions/:id': {
      expected: READ,
      send: (as, w) => as.get(`/transactions/${w.transaction}`),
    },
    'PATCH /transactions/:id': {
      expected: WRITE,
      send: (as, w) =>
        as.patch(`/transactions/${w.transaction}`, newTransaction(w.shared)),
    },
    'DELETE /transactions/:id': {
      expected: WRITE,
      send: (as, w) => as.delete(`/transactions/${w.transaction}`),
    },
    'POST /transactions/:id/restore': {
      expected: WRITE,
      send: (as, w) => as.post(`/transactions/${w.deleted}/restore`),
    },
    'PATCH /transactions/:id/recurring': {
      expected: WRITE,
      send: (as, w) =>
        as.patch(`/transactions/${w.root}/recurring`, { amount: '20' }),
    },
    'POST /transactions/:id/recurring/pause': {
      expected: WRITE,
      send: (as, w) => as.post(`/transactions/${w.root}/recurring/pause`),
    },
    'POST /transactions/:id/recurring/resume': {
      expected: WRITE,
      send: (as, w) => as.post(`/transactions/${w.paused}/recurring/resume`),
    },
    'POST /transactions/:id/recurring/cancel': {
      expected: WRITE,
      send: (as, w) => as.post(`/transactions/${w.root}/recurring/cancel`),
    },
    'POST /draft-transactions': {
      expected: WRITE,
      send: (as, w) =>
        as.post('/draft-transactions', {
          rawInput: 'coffee',
          parsedData: draftFields(w.shared),
          confidenceScore: 0.9,
        }),
    },
    'GET /draft-transactions': {
      expected: ANYONE,
      send: (as) => as.get('/draft-transactions'),
    },
    'GET /draft-transactions/pending-count': {
      expected: ANYONE,
      send: (as) => as.get('/draft-transactions/pending-count'),
    },
    'PATCH /draft-transactions/:id/approve': {
      expected: WRITE,
      send: (as, w, role) =>
        as.patch(`/draft-transactions/${w.drafts[role]}/approve`, {}),
    },
    'PATCH /draft-transactions/:id/reject': {
      expected: ANYONE,
      send: (as, w, role) =>
        as.patch(`/draft-transactions/${w.drafts[role]}/reject`, {}),
    },
    'GET /export': { expected: ANYONE, send: (as) => as.get('/export') },
  };

  /** Routes of the same families this spec doesn't drive, and why that's fine. */
  const NOT_ACCOUNT_SCOPED: Record<string, string> = {
    '/auth': 'sign-in; no account data',
    '/oauth': 'OAuth for connected apps; no account data',
    '/.well-known': 'OAuth discovery documents',
    '/health': 'liveness and readiness probes',
    '/users': "the caller's own profile; delete and reset are tested below",
    '/invitations': 'token flows; account-sharing.db-spec.ts covers them',
    '/ai': 'chats are private to their user; the tools are tested below',
    '/mcp': 'the transport; its tools are tested below',
    'POST /categories': "creates in the caller's own set",
    'PATCH /categories': "edits the caller's own set only",
    'DELETE /categories': "deletes from the caller's own set only",
    'GET /categories/': "reads the caller's own set only",
  };

  function allRoutes(): string[] {
    const src = join(__dirname, '..', 'src');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return files(path);
        return name.endsWith('.controller.ts') ? [path] : [];
      });
    const found: string[] = [];
    for (const file of files(src)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const exported = require(file) as Record<string, unknown>;
      for (const controller of Object.values(exported)) {
        if (
          typeof controller !== 'function' ||
          Reflect.getMetadata(PATH_METADATA, controller) === undefined
        )
          continue;
        const base = String(
          Reflect.getMetadata(PATH_METADATA, controller),
        ).replace(/^\/|\/$/g, '');
        const proto = controller.prototype as Record<string, object>;
        for (const name of Object.getOwnPropertyNames(proto)) {
          if (name === 'constructor') continue;
          const method = Reflect.getMetadata(METHOD_METADATA, proto[name]) as
            | RequestMethod
            | undefined;
          if (method === undefined) continue;
          const sub = String(
            Reflect.getMetadata(PATH_METADATA, proto[name]),
          ).replace(/^\/|\/$/g, '');
          const path = `/${[base, sub].filter(Boolean).join('/')}`;
          found.push(`${RequestMethod[method]} ${path}`);
        }
      }
    }
    return found;
  }

  it('covers every route: listed above, or exempt for a stated reason', () => {
    const unlisted = allRoutes().filter((route) => {
      if (route in ROUTES) return false;
      const path = route.split(' ')[1];
      return (
        path !== '/' &&
        !Object.keys(NOT_ACCOUNT_SCOPED).some(
          (prefix) =>
            path === prefix ||
            path.startsWith(`${prefix}/`) ||
            route.startsWith(prefix),
        )
      );
    });
    expect(unlisted).toEqual([]);
  });

  describe.each(Object.entries(ROUTES))('%s', (_route, { expected, send }) => {
    it.each(ROLES.map((role, i) => [role, expected[i]] as const))(
      '%s → %s',
      async (role, outcome) => {
        const w = await world();
        const res = await send(client(w.people[role]), w, role);
        if (outcome === 'ok') {
          expect([res.status, res.body]).toEqual([
            expect.any(Number),
            expect.anything(),
          ]);
          expect(res.status).toBeGreaterThanOrEqual(200);
          expect(res.status).toBeLessThan(300);
        } else {
          expect(res.status).toBe(outcome);
        }
      },
    );
  });

  describe('MCP tools', () => {
    const TOOLS: Record<
      McpToolName,
      { expected: Expected; args: (w: World) => unknown }
    > = {
      create_draft_transaction: {
        expected: WRITE.map((o) =>
          o === 403 ? 400 : o === 404 ? 400 : o,
        ) as never,
        args: (w) => ({
          rawInput: 'coffee',
          parsedData: draftFields(w.shared),
          confidenceScore: 0.9,
        }),
      },
      search_transactions: {
        expected: READ,
        args: (w) => ({ accountId: w.shared, limit: 20, offset: 0 }),
      },
      get_balance: { expected: READ, args: (w) => ({ accountId: w.shared }) },
      get_monthly_summary: {
        expected: READ,
        args: (w) => ({
          year: YEAR,
          month: MONTH,
          refresh: false,
          accountId: w.shared,
        }),
      },
      list_accounts: {
        expected: ANYONE,
        args: () => ({ status: 'active', limit: 20, offset: 0 }),
      },
      list_categories: {
        expected: READ,
        args: (w) => ({
          status: 'active',
          limit: 20,
          offset: 0,
          accountId: w.shared,
        }),
      },
      list_goals: {
        expected: ANYONE,
        args: () => ({ status: 'active', limit: 20, offset: 0 }),
      },
      get_goal: { expected: READ, args: (w) => ({ goalId: w.goal }) },
      get_goal_history: {
        expected: READ,
        args: (w) => ({ goalId: w.goal, limit: 20, offset: 0 }),
      },
    };

    it('covers every tool', () => {
      expect(Object.keys(TOOLS).sort()).toEqual(
        MCP_TOOLS.map((tool) => tool.name).sort(),
      );
    });

    describe.each(Object.entries(TOOLS))('%s', (tool, { expected, args }) => {
      it.each(ROLES.map((role, i) => [role, expected[i]] as const))(
        '%s → %s',
        async (role, outcome) => {
          const w = await world();
          const run = Promise.resolve(
            mcp.dispatch(w.people[role], tool as McpToolName, args(w), {
              source: DraftSource.MCP,
            }),
          );
          if (outcome === 'ok') await expect(run).resolves.toBeDefined();
          else await expect(run).rejects.toMatchObject({ status: outcome });
        },
      );
    });

    it('never shows a stranger the shared account in its lists', async () => {
      const w = await world();
      const pageArgs = { status: 'active', limit: 20, offset: 0 };
      const accounts = (await mcp.dispatch(
        w.people.stranger,
        'list_accounts',
        pageArgs,
      )) as { data: unknown[] };
      const goals = (await mcp.dispatch(
        w.people.stranger,
        'list_goals',
        pageArgs,
      )) as { data: unknown[] };
      expect(accounts.data).toEqual([]);
      expect(goals.data).toEqual([]);
    });

    it('tells a member their role in list_accounts', async () => {
      const w = await world();
      const accounts = (await mcp.dispatch(w.people.viewer, 'list_accounts', {
        status: 'active',
        limit: 20,
        offset: 0,
      })) as { data: { role: string }[] };
      expect(accounts.data.map((a) => a.role)).toEqual(['VIEWER']);
    });
  });

  describe('chat tools', () => {
    const context = (userId: string) => ({
      userId,
      timeZone: 'UTC',
      now: NOW,
      question: 'coffee 3',
      source: DraftSource.CHAT as 'CHAT',
      isDemo: false,
    });
    const TOOLS: Record<
      string,
      { expected: Expected; args: (w: World) => object }
    > = {
      search_transactions: {
        expected: READ,
        args: (w) => ({ accountId: w.shared }),
      },
      get_balance: { expected: READ, args: (w) => ({ accountId: w.shared }) },
      get_monthly_summary: {
        expected: READ,
        args: (w) => ({ year: YEAR, month: MONTH, accountId: w.shared }),
      },
      list_categories: {
        expected: READ,
        args: (w) => ({ accountId: w.shared }),
      },
      list_goals: { expected: ANYONE, args: () => ({}) },
      get_goal: { expected: READ, args: (w) => ({ goalId: w.goal }) },
      get_goal_history: {
        expected: READ,
        args: (w) => ({ goalId: w.goal }),
      },
      chart_spending_by_category: {
        expected: READ,
        args: (w) => ({
          year: YEAR,
          month: MONTH,
          currency: 'EUR',
          accountId: w.shared,
        }),
      },
      chart_income_vs_expenses: {
        expected: READ,
        args: (w) => ({ months: 3, currency: 'EUR', accountId: w.shared }),
      },
      chart_daily_trend: {
        expected: READ,
        args: (w) => ({ days: 7, currency: 'EUR', accountId: w.shared }),
      },
      create_draft_transaction: {
        expected: WRITE,
        args: (w) => ({
          type: 'EXPENSE',
          description: 'Coffee',
          amount: '3',
          currency: 'EUR',
          fromAccountId: w.shared,
          confidence: 0.9,
        }),
      },
    };

    it('covers every tool the chat offers', () => {
      expect(Object.keys(TOOLS).sort()).toEqual(
        [
          ...CHAT_MCP_TOOLS,
          ...CHART_TOOL_NAMES,
          'list_categories',
          'create_draft_transaction',
        ].sort(),
      );
    });

    describe.each(Object.entries(TOOLS))('%s', (tool, { expected, args }) => {
      it.each(ROLES.map((role, i) => [role, expected[i]] as const))(
        '%s → %s',
        async (role, outcome) => {
          const w = await world();
          const { content, chart } = await chat.run(
            context(w.people[role]),
            tool,
            JSON.stringify(args(w)),
          );
          const reply = (content ? JSON.parse(content) : {}) as {
            error?: string;
          };
          if (outcome === 'ok') {
            // Allowed: the tool ran. "No activity" is a chart's way of saying so.
            expect(
              chart !== undefined ||
                !reply.error ||
                /No activity/.test(reply.error),
            ).toBe(true);
          } else {
            expect(reply.error).toMatch(
              /not found|doesn't allow|Unknown account/i,
            );
          }
        },
      );
    });
  });

  describe('what each person sees', () => {
    it('lists the account for members, with their role, and not for anyone else', async () => {
      const w = await world();
      const list = async (role: Role) => {
        const { body } = await client(w.people[role]).get('/accounts');
        return (body as { data: { id: string; role: string }[] }).data;
      };
      expect((await list('editor')).map((a) => [a.id, a.role])).toEqual([
        [w.shared, 'EDITOR'],
      ]);
      expect((await list('viewer')).map((a) => [a.id, a.role])).toEqual([
        [w.shared, 'VIEWER'],
      ]);
      expect(await list('stranger')).toEqual([]);
    });

    it('never gives a member the owner’s other account', async () => {
      const w = await world();
      await prisma.transaction.create({
        data: {
          userId: w.people.owner,
          createdById: w.people.owner,
          type: 'TRANSFER',
          description: 'To savings',
          currency: 'EUR',
          occurredAt: NOW,
          items: {
            create: [
              leg(w.people.owner, w.shared, 'DEBIT', 40),
              leg(w.people.owner, w.privateAccount, 'CREDIT', 40),
            ],
          },
        },
      });
      const as = client(w.people.viewer);

      const { body: found } = await as.get(
        '/search/transactions?q=To%20savings',
      );
      const text = JSON.stringify(found);
      expect(text).not.toContain(w.privateAccount);
      expect(text).not.toContain('Secret savings');
      expect(text).toContain(HIDDEN_ACCOUNT_NAME);

      const { body: detail } = await as.get(
        `/transactions/${(found as { data: { id: string }[] }).data[0].id}`,
      );
      expect(JSON.stringify(detail)).not.toContain('Secret savings');
      expect(detail).toMatchObject({ canEdit: false });

      const { text: exported } = await as.get('/export?format=json');
      expect(exported).not.toContain(w.privateAccount);
      expect(exported).not.toContain('Secret savings');

      const { body: balances } = await as.get('/ledger/balance');
      expect(JSON.stringify(balances)).not.toContain(w.privateAccount);
    });

    it('counts only what the member can reach in all-accounts figures', async () => {
      const w = await world();
      await expense(w.people.owner, w.privateAccount, {}, 999);
      const summary = await client(w.people.viewer).get(
        `/analytics/monthly-summary?year=${YEAR}&month=${MONTH}&currency=EUR`,
      );
      // The shared account's three live expenses of 10; the private 999 stays out.
      expect((summary.body as { expenses: string }).expenses).toBe('30');
      const owner = await client(w.people.owner).get(
        `/analytics/monthly-summary?year=${YEAR}&month=${MONTH}&currency=EUR`,
      );
      expect((owner.body as { expenses: string }).expenses).toBe('1029');
    });

    it('filters a member’s amount search in SQL to the accounts they reach', async () => {
      const w = await world();
      await expense(w.people.owner, w.privateAccount, {}, 999);
      const { body } = await client(w.people.viewer).get(
        '/search/transactions?minAmount=5',
      );
      expect((body as { total: number }).total).toBe(3);
    });

    it('answers someone with no accounts at all with empty figures', async () => {
      const lonely = await user('lonely');
      const as = client(lonely);
      await as
        .get(`/analytics/daily-series?from=${TODAY}&days=3&currency=EUR`)
        .expect(200);
      await as
        .get('/analytics/monthly-series?months=3&currency=EUR')
        .expect(200);
      await as.get('/search/transactions?minAmount=1').expect(200);
      const { body } = await as.get('/ledger/balance').expect(200);
      expect(body).toEqual([]);
    });

    it('shows a linked goal to all members, with progress from everyone’s entries', async () => {
      const w = await world();
      await client(w.people.editor)
        .post('/transactions', {
          type: 'INCOME',
          description: 'Refund',
          amount: '200',
          currency: 'EUR',
          occurredAt: NOW.toISOString(),
          toAccountId: w.shared,
        })
        .expect(201);
      const { body } = await client(w.people.viewer).get(`/goals/${w.goal}`);
      expect(
        Number(
          (body as { currentInstance: { progressAmount: string } })
            .currentInstance.progressAmount,
        ),
      ).toBeGreaterThan(100);
    });
  });

  describe('who entered what', () => {
    it('records the author on the owner’s ledger, and who last edited it', async () => {
      const w = await world();
      const { body: created } = await client(w.people.editor)
        .post('/transactions', newTransaction(w.shared))
        .expect(201);
      const { id } = created as { id: string };
      const row = await prisma.transaction.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });
      expect(row).toMatchObject({
        userId: w.people.owner,
        createdById: w.people.editor,
        updatedById: null,
      });
      expect(row.items[0].userId).toBe(w.people.owner);

      await client(w.people.owner)
        .patch(`/transactions/${id}`, newTransaction(w.shared))
        .expect(200);
      const { body } = await client(w.people.viewer).get(`/transactions/${id}`);
      expect(body).toMatchObject({
        createdBy: { id: w.people.editor, displayName: 'editor' },
        updatedBy: { id: w.people.owner, displayName: 'owner' },
      });
      expect(
        JSON.stringify((body as { createdBy: object }).createdBy),
      ).not.toContain('@');
    });
  });

  describe('drafts', () => {
    it('stay private to their author, whoever is on the account', async () => {
      const w = await world();
      const { body } = await client(w.people.owner).get('/draft-transactions');
      const ids = (body as { data: { id: string }[] }).data.map((d) => d.id);
      expect(ids).toEqual([w.drafts.owner]);
      await client(w.people.owner)
        .patch(`/draft-transactions/${w.drafts.editor}/approve`, {})
        .expect(404);
    });

    it('post to the owner’s ledger when an editor approves', async () => {
      const w = await world();
      const { body } = await client(w.people.editor)
        .patch(`/draft-transactions/${w.drafts.editor}/approve`, {})
        .expect(200);
      expect(body).toMatchObject({
        transaction: {
          userId: w.people.owner,
          createdById: w.people.editor,
        },
      });
    });

    it('stop being approvable when the role drops while they wait', async () => {
      const w = await world();
      await prisma.accountMember.updateMany({
        where: { accountId: w.shared, userId: w.people.editor },
        data: { role: 'VIEWER' },
      });
      await client(w.people.editor)
        .patch(`/draft-transactions/${w.drafts.editor}/approve`, {})
        .expect(403);
    });

    const run = (userId: string, args: object = {}) =>
      mcp.dispatch(userId, 'create_draft_transaction', {
        rawInput: 'coffee',
        confidenceScore: 0.9,
        parsedData: {
          type: 'EXPENSE',
          description: 'Coffee',
          amount: '3',
          currency: 'EUR',
          occurredAt: TODAY,
          ...args,
        },
      }) as Promise<{ parsedData: { fromAccountId?: string } }>;

    it('default to an account the user can post to, never a view-only one', async () => {
      const w = await world();
      const { id: own } = await account(w.people.viewer, 'Zzz own');
      // The main account and the alphabetical order both point at the shared one.
      await prisma.user.update({
        where: { id: w.people.viewer },
        data: { settings: { mainAccountId: w.shared } },
      });
      const draft = await run(w.people.viewer);
      expect(draft.parsedData.fromAccountId).toBe(own);
    });

    it('from the Drafts box never land on a view-only account, even when asked to', async () => {
      const w = await world();
      const { body } = await client(w.people.viewer)
        .post('/ai/transaction-intents', {
          input: 'coffee 3',
          defaultAccountId: w.shared,
          defaultCurrency: 'EUR',
        })
        .expect(201);
      expect(JSON.stringify(body)).not.toContain(w.shared);
    });

    it('from the Drafts box use the shared account for an editor', async () => {
      const w = await world();
      const { body } = await client(w.people.editor)
        .post('/ai/transaction-intents', {
          input: 'coffee 3',
          defaultAccountId: w.shared,
          defaultCurrency: 'EUR',
        })
        .expect(201);
      expect(JSON.stringify(body)).toContain(w.shared);
    });

    it('have no account when the user can only view', async () => {
      const w = await world();
      const draft = await run(w.people.viewer);
      expect(draft.parsedData.fromAccountId).toBeUndefined();
    });

    it('can default to a shared account for an editor', async () => {
      const w = await world();
      const draft = await run(w.people.editor);
      expect(draft.parsedData.fromAccountId).toBe(w.shared);
    });

    it('reject naming a view-only account, listing what can be used', async () => {
      const w = await world();
      await expect(
        run(w.people.viewer, { fromAccountId: w.shared }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('categories', () => {
    async function withCategories() {
      const w = await world();
      const owners = await prisma.category.create({
        data: { userId: w.people.owner, name: 'Food', type: 'EXPENSE' },
      });
      const editors = await prisma.category.create({
        data: { userId: w.people.editor, name: 'Own food', type: 'EXPENSE' },
      });
      return { w, owners: owners.id, editors: editors.id };
    }

    it('on a shared account are the owner’s', async () => {
      const { w, owners, editors } = await withCategories();
      const as = client(w.people.editor);
      const { body } = await as.get(`/categories?accountId=${w.shared}`);
      const ids = (body as { data: { id: string }[] }).data.map((c) => c.id);
      expect(ids).toContain(owners);
      expect(ids).not.toContain(editors);

      await as
        .post('/transactions', {
          ...newTransaction(w.shared),
          categoryId: owners,
        })
        .expect(201);
      await as
        .post('/transactions', {
          ...newTransaction(w.shared),
          categoryId: editors,
        })
        .expect(404);
    });

    it('can be filtered on by a member', async () => {
      const { w, owners } = await withCategories();
      await client(w.people.viewer)
        .get(`/search/transactions?categoryId=${owners}`)
        .expect(200);
      await client(w.people.stranger)
        .get(`/search/transactions?categoryId=${owners}`)
        .expect(404);
    });

    it('can’t be changed by a member', async () => {
      const { w, owners } = await withCategories();
      await client(w.people.editor)
        .patch(`/categories/${owners}`, { name: 'Mine now' })
        .expect(404);
    });

    it('merge by name in a member’s all-accounts breakdown', async () => {
      const { w, owners } = await withCategories();
      const { id: own } = await account(w.people.editor, 'Own');
      const food = await prisma.category.create({
        data: { userId: w.people.editor, name: 'food', type: 'EXPENSE' },
      });
      await expense(w.people.owner, w.shared, { categoryId: owners });
      await expense(w.people.editor, own, { categoryId: food.id });
      const { body } = await client(w.people.editor).get(
        `/analytics/monthly-summary?year=${YEAR}&month=${MONTH}&currency=EUR`,
      );
      const lines = (
        body as { categoryBreakdown: { category: string; amount: string }[] }
      ).categoryBreakdown.filter((c) => c.category.toLowerCase() === 'food');
      expect(lines).toHaveLength(1);
      expect(lines[0].amount).toBe('20');
    });

    it('in a draft for a shared account are checked against the owner’s', async () => {
      const { w, owners, editors } = await withCategories();
      const draft = (categoryId: string) =>
        mcp.dispatch(w.people.editor, 'create_draft_transaction', {
          rawInput: 'coffee',
          confidenceScore: 0.9,
          parsedData: { ...draftFields(w.shared), categoryId },
        });
      await expect(draft(owners)).resolves.toBeDefined();
      await expect(draft(editors)).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('transfers', () => {
    const transfer = (from: string, to: string) => ({
      type: 'TRANSFER',
      description: 'Move',
      amount: '5',
      currency: 'EUR',
      occurredAt: NOW.toISOString(),
      fromAccountId: from,
      toAccountId: to,
    });

    it('can’t cross accounts with different owners', async () => {
      const w = await world();
      const { id: own } = await account(w.people.editor, 'Own');
      const res = await client(w.people.editor).post(
        '/transactions',
        transfer(own, w.shared),
      );
      expect(res.status).toBe(400);
      expect(res.text).toContain('different owners');
    });

    it('can’t be proposed across owners by an assistant', async () => {
      const w = await world();
      const { id: own } = await account(w.people.editor, 'Own');
      await expect(
        mcp.dispatch(w.people.editor, 'create_draft_transaction', {
          rawInput: 'move',
          confidenceScore: 0.9,
          parsedData: {
            ...draftFields(own),
            type: 'TRANSFER',
            toAccountId: w.shared,
          },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('work between two accounts of one owner', async () => {
      const w = await world();
      const { id: second } = await account(w.people.owner, 'Second');
      await prisma.accountMember.create({
        data: { accountId: second, userId: w.people.editor, role: 'EDITOR' },
      });
      await client(w.people.editor)
        .post('/transactions', transfer(w.shared, second))
        .expect(201);
    });

    it('need access to both sides to change', async () => {
      const w = await world();
      const row = await prisma.transaction.create({
        data: {
          userId: w.people.owner,
          createdById: w.people.owner,
          type: 'TRANSFER',
          description: 'To savings',
          currency: 'EUR',
          occurredAt: NOW,
          items: {
            create: [
              leg(w.people.owner, w.shared, 'DEBIT'),
              leg(w.people.owner, w.privateAccount, 'CREDIT'),
            ],
          },
        },
      });
      await client(w.people.editor)
        .delete(`/transactions/${row.id}`)
        .expect(403);
    });

    it('that were split by a handover can’t be changed', async () => {
      const w = await world();
      await prisma.transaction.create({
        data: {
          userId: w.people.owner,
          createdById: w.people.owner,
          type: 'TRANSFER',
          description: 'To savings',
          currency: 'EUR',
          occurredAt: NOW,
          items: {
            create: [
              leg(w.people.owner, w.shared, 'DEBIT'),
              leg(w.people.owner, w.privateAccount, 'CREDIT'),
            ],
          },
        },
      });
      await app
        .get(OwnershipService, { strict: false })
        .transfer(w.people.owner, w.shared, w.people.editor);
      const side = await prisma.transaction.findFirstOrThrow({
        where: { userId: w.people.editor, type: 'TRANSFER' },
      });
      const as = client(w.people.editor);
      const { body } = await as.get(`/transactions/${side.id}`).expect(200);
      expect(body).toMatchObject({ canEdit: false });
      await as.delete(`/transactions/${side.id}`).expect(400);
      await as
        .patch(`/transactions/${side.id}`, newTransaction(w.shared))
        .expect(400);
    });
  });

  describe('cached figures', () => {
    const path = (accountId: string) =>
      `/analytics/monthly-summary?year=${YEAR}&month=${MONTH}&accountId=${accountId}`;

    it('aren’t served to someone removed from the account', async () => {
      const w = await world();
      const as = client(w.people.viewer);
      await as.get(path(w.shared)).expect(200);
      await prisma.accountMember.deleteMany({
        where: { accountId: w.shared, userId: w.people.viewer },
      });
      await as.get(path(w.shared)).expect(404);
    });

    it('go stale for nobody when someone else adds a transaction', async () => {
      const w = await world();
      const expenses = async () =>
        (
          (await client(w.people.owner).get(path(w.shared))).body as {
            expenses: string;
          }
        ).expenses;
      expect(await expenses()).toBe('30');
      await client(w.people.editor)
        .post('/transactions', newTransaction(w.shared))
        .expect(201);
      // Listeners run after the response; give the cache delete its turn.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await expenses()).toBe('42');
    });

    it('drop a removed member’s all-accounts figures too', async () => {
      const w = await world();
      const all = `/analytics/monthly-summary?year=${YEAR}&month=${MONTH}&currency=EUR`;
      const as = client(w.people.viewer);
      const before = await as.get(all);
      expect((before.body as { expenses: string }).expenses).toBe('30');
      await client(w.people.owner)
        .delete(`/accounts/${w.shared}/members/${w.people.viewer}`)
        .expect(204);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const after = await as.get(all);
      expect((after.body as { expenses: string }).expenses).toBe('0');
    });
  });

  describe('archived accounts', () => {
    it('stay readable and refuse changes, for every role', async () => {
      const w = await world();
      await client(w.people.viewer)
        .get(`/ledger/balance?accountId=${w.closed}`)
        .expect(200);
      await client(w.people.editor)
        .post('/transactions', newTransaction(w.closed))
        .expect(404);
    });
  });

  describe('recurring series', () => {
    it('keep posting to the owner’s ledger after the editor who made them leaves', async () => {
      const w = await world();
      const root = await expense(w.people.owner, w.shared, {
        createdById: w.people.editor,
        isRecurring: true,
        recurringInterval: 'MONTHLY',
        recurringStatus: 'ACTIVE',
        recurringAmount: D(10),
        recurringFromAccountId: w.shared,
        nextOccurrenceAt: new Date(NOW.getTime() - 86_400_000),
      });
      await client(w.people.editor)
        .delete(`/accounts/${w.shared}/members/me`)
        .expect(204);

      await app.get(RecurringTransactionsCron, { strict: false })['generate']();

      const occurrence = await prisma.transaction.findFirstOrThrow({
        where: { parentTransactionId: root.id },
      });
      expect(occurrence).toMatchObject({
        userId: w.people.owner,
        createdById: w.people.editor,
      });
    });
  });

  describe('deleting and resetting', () => {
    const confirm = { confirm: 'DELETE' };

    it('keeps a member’s transactions and the balance when they delete their user', async () => {
      const w = await world();
      await client(w.people.editor)
        .post('/transactions', newTransaction(w.shared))
        .expect(201);
      const balance = async () =>
        (
          await client(w.people.owner).get(
            `/ledger/balance?accountId=${w.shared}`,
          )
        ).body as unknown;
      const before = await balance();

      await client(w.people.editor).delete('/users/me', confirm).expect(204);

      expect(await balance()).toEqual(before);
    });

    it('takes the member off the account on reset, and leaves the owner’s ledger alone', async () => {
      const w = await world();
      await client(w.people.editor)
        .post('/transactions', newTransaction(w.shared))
        .expect(201);
      const count = () =>
        prisma.transactionItem.count({ where: { accountId: w.shared } });
      const before = await count();

      await client(w.people.editor)
        .post('/users/me/reset-data', confirm)
        .expect(204);

      expect(await count()).toBe(before);
      await client(w.people.editor)
        .get(`/ledger/balance?accountId=${w.shared}`)
        .expect(404);
    });

    it('removes the account for everyone when its owner deletes their user', async () => {
      const w = await world();
      await client(w.people.editor)
        .post('/transactions', newTransaction(w.shared))
        .expect(201);

      await client(w.people.owner).delete('/users/me', confirm).expect(204);

      await client(w.people.editor)
        .get(`/ledger/balance?accountId=${w.shared}`)
        .expect(404);
      expect(await prisma.account.count({ where: { id: w.shared } })).toBe(0);
    });
  });
});
