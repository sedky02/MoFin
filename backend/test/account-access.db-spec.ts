/**
 * AccountAccessService against real Postgres: the rules themselves are unit
 * tested in account-access.spec.ts, this proves the queries and foreign keys
 * behind them. Needs TEST_DATABASE_URL (see support/test-database.ts).
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountMemberRole, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/database/prisma.service';
import {
  AccountAction,
  can,
} from '../src/modules/account-access/account-access';
import { AccountAccessService } from '../src/modules/account-access/account-access.service';
import { testDatabaseUrl } from './support/test-database';

const ACTIONS: AccountAction[] = [
  'view',
  'transact',
  'goals',
  'manage',
  'leave',
];

describe('AccountAccessService (Postgres)', () => {
  let prisma: PrismaService;
  let access: AccountAccessService;
  const users: string[] = [];

  async function user(name: string) {
    const id = randomUUID();
    users.push(id);
    await prisma.user.create({
      data: { id, email: `${name}-${id}@example.com` },
    });
    return id;
  }

  const account = (userId: string, name = 'Joint', archived = false) =>
    prisma.account.create({
      data: {
        userId,
        name,
        type: 'BANK',
        currency: 'EUR',
        archivedAt: archived ? new Date() : null,
      },
    });

  const join = (accountId: string, userId: string, role: AccountMemberRole) =>
    prisma.accountMember.create({ data: { accountId, userId, role } });

  /** A transaction on `ledger`'s books, entered by `createdById`, with one leg per account. */
  async function transaction(
    ledger: string,
    createdById: string,
    legs: { accountId: string; direction: 'DEBIT' | 'CREDIT' }[],
  ) {
    return prisma.transaction.create({
      data: {
        userId: ledger,
        createdById,
        type: legs.length > 1 ? 'TRANSFER' : 'EXPENSE',
        description: 'Test',
        currency: 'EUR',
        occurredAt: new Date(),
        items: {
          create: legs.map((leg) => ({
            ...leg,
            userId: ledger,
            amount: new Prisma.Decimal(10),
            currency: 'EUR',
          })),
        },
      },
    });
  }

  beforeAll(() => {
    prisma = new PrismaService({
      getOrThrow: () => testDatabaseUrl(),
    } as unknown as ConfigService);
    access = new AccountAccessService(prisma);
  });

  afterAll(async () => {
    // Ledger rows first: they hold their accounts with RESTRICT.
    await prisma.transactionItem.deleteMany({
      where: { userId: { in: users } },
    });
    await prisma.transaction.deleteMany({ where: { userId: { in: users } } });
    await prisma.account.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  describe('assertAccess', () => {
    let accountId: string;
    const people = {} as Record<'OWNER' | AccountMemberRole, string>;
    let stranger: string;

    beforeAll(async () => {
      people.OWNER = await user('owner');
      people.EDITOR = await user('editor');
      people.VIEWER = await user('viewer');
      stranger = await user('stranger');
      accountId = (await account(people.OWNER)).id;
      await join(accountId, people.EDITOR, 'EDITOR');
      await join(accountId, people.VIEWER, 'VIEWER');
    });

    for (const role of ['OWNER', 'EDITOR', 'VIEWER'] as const) {
      for (const action of ACTIONS) {
        const allowed = can(role, action);
        it(`${role} ${action}: ${allowed ? 'passes' : '403'}`, async () => {
          const check = access.assertAccess(people[role], accountId, action);
          if (allowed) await expect(check).resolves.toMatchObject({ role });
          else await expect(check).rejects.toBeInstanceOf(ForbiddenException);
        });
      }
    }

    for (const action of ACTIONS) {
      it(`a non-member gets a 404 for ${action}`, async () => {
        await expect(
          access.assertAccess(stranger, accountId, action),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    }

    it('answers an unknown id like one the user has no access to', async () => {
      const missing = await access
        .assertAccess(stranger, 'no-such-account', 'view')
        .catch((error: NotFoundException) => error.getStatus());
      expect(missing).toBe(404);
    });

    it('does not return the membership rows with the account', async () => {
      const { account: row } = await access.assertAccess(
        people.EDITOR,
        accountId,
        'view',
      );
      expect(row).not.toHaveProperty('members');
    });

    it('sees a role change and a removal on the very next check', async () => {
      const member = await user('member');
      await join(accountId, member, 'EDITOR');
      await access.assertAccess(member, accountId, 'transact');

      await prisma.accountMember.update({
        where: { accountId_userId: { accountId, userId: member } },
        data: { role: 'VIEWER' },
      });
      await expect(
        access.assertAccess(member, accountId, 'transact'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await prisma.accountMember.delete({
        where: { accountId_userId: { accountId, userId: member } },
      });
      await expect(
        access.assertAccess(member, accountId, 'view'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('treats an archived account as missing only when activeOnly is set', async () => {
      const owner = await user('owner');
      const archived = await account(owner, 'Old', true);
      await expect(
        access.assertAccess(owner, archived.id, 'view'),
      ).resolves.toMatchObject({ role: 'OWNER' });
      await expect(
        access.assertAccess(owner, archived.id, 'transact', {
          activeOnly: true,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reads through the caller’s transaction', async () => {
      const owner = await user('owner');
      await prisma
        .$transaction(async (db) => {
          const created = await db.account.create({
            data: {
              userId: owner,
              name: 'New',
              type: 'CASH',
              currency: 'EUR',
            },
          });
          await access.assertAccess(owner, created.id, 'manage', { db });
          throw new Error('rollback');
        })
        .catch((error: Error) => expect(error.message).toBe('rollback'));
    });
  });

  describe('accessibleAccountIds and rolesOn', () => {
    it('lists own and shared accounts per action, never someone else’s', async () => {
      const me = await user('me');
      const other = await user('other');
      const mine = await account(me, 'Mine');
      const edit = await account(other, 'Edit');
      const view = await account(other, 'View');
      const closed = await account(other, 'Closed', true);
      const notMine = await account(other, 'Private');
      await join(edit.id, me, 'EDITOR');
      await join(view.id, me, 'VIEWER');
      await join(closed.id, me, 'EDITOR');

      const ids = async (
        action: AccountAction,
        options?: { activeOnly: boolean },
      ) => (await access.accessibleAccountIds(me, action, options)).sort();

      expect(await ids('view')).toEqual(
        [mine.id, edit.id, view.id, closed.id].sort(),
      );
      expect(await ids('transact')).toEqual(
        [mine.id, edit.id, closed.id].sort(),
      );
      expect(await ids('transact', { activeOnly: true })).toEqual(
        [mine.id, edit.id].sort(),
      );
      expect(await ids('manage')).toEqual([mine.id]);
      expect(await ids('leave')).toEqual([edit.id, view.id, closed.id].sort());

      const roles = await access.rolesOn(me, [
        mine.id,
        edit.id,
        view.id,
        notMine.id,
      ]);
      expect(Object.fromEntries(roles)).toEqual({
        [mine.id]: 'OWNER',
        [edit.id]: 'EDITOR',
        [view.id]: 'VIEWER',
      });
    });
  });

  describe('assertTransactionAccess', () => {
    let owner: string;
    let editor: string;
    let viewer: string;
    let stranger: string;
    let shared: string;
    let privateId: string;
    let onShared: string;
    let transfer: string;

    beforeAll(async () => {
      owner = await user('owner');
      editor = await user('editor');
      viewer = await user('viewer');
      stranger = await user('stranger');
      shared = (await account(owner, 'Joint')).id;
      privateId = (await account(owner, 'Private')).id;
      await join(shared, editor, 'EDITOR');
      await join(shared, viewer, 'VIEWER');
      onShared = (
        await transaction(owner, owner, [
          { accountId: shared, direction: 'DEBIT' },
        ])
      ).id;
      transfer = (
        await transaction(owner, owner, [
          { accountId: shared, direction: 'DEBIT' },
          { accountId: privateId, direction: 'CREDIT' },
        ])
      ).id;
    });

    it('lets every member see a transaction on the shared account', async () => {
      for (const id of [owner, editor, viewer]) {
        await expect(
          access.assertTransactionAccess(id, onShared, 'view'),
        ).resolves.toMatchObject({ id: onShared });
      }
    });

    it('lets an editor change it, not a viewer', async () => {
      await expect(
        access.assertTransactionAccess(editor, onShared, 'transact'),
      ).resolves.toMatchObject({ id: onShared });
      await expect(
        access.assertTransactionAccess(viewer, onShared, 'transact'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers 404 to someone who reaches none of its accounts', async () => {
      for (const action of ['view', 'transact'] as const) {
        await expect(
          access.assertTransactionAccess(stranger, onShared, action),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
    });

    it('shows a transfer through one leg but needs every leg to change it', async () => {
      await expect(
        access.assertTransactionAccess(editor, transfer, 'view'),
      ).resolves.toMatchObject({ id: transfer });
      await expect(
        access.assertTransactionAccess(editor, transfer, 'transact'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        access.assertTransactionAccess(owner, transfer, 'transact'),
      ).resolves.toMatchObject({ id: transfer });
    });

    it('counts the accounts a recurring series posts to', async () => {
      const root = await transaction(owner, owner, [
        { accountId: shared, direction: 'DEBIT' },
      ]);
      await prisma.transaction.update({
        where: { id: root.id },
        data: { recurringToAccountId: privateId },
      });
      await expect(
        access.assertTransactionAccess(editor, root.id, 'transact'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers 404 for an id that does not exist', async () => {
      await expect(
        access.assertTransactionAccess(owner, 'no-such-id', 'view'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('usersWithAccess', () => {
    it('is the owner and the members, each once', async () => {
      const owner = await user('owner');
      const member = await user('member');
      const first = await account(owner, 'One');
      const second = await account(owner, 'Two');
      await join(first.id, member, 'VIEWER');
      await join(second.id, member, 'EDITOR');
      const everyone = await access.usersWithAccess([first.id, second.id]);
      expect(everyone.sort()).toEqual([owner, member].sort());
    });
  });

  describe('the schema', () => {
    it('allows one membership per person and account', async () => {
      const owner = await user('owner');
      const member = await user('member');
      const { id } = await account(owner);
      await join(id, member, 'VIEWER');
      await expect(join(id, member, 'EDITOR')).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('allows one invitation per account and email', async () => {
      const owner = await user('owner');
      const { id } = await account(owner);
      const invite = (tokenHash: string) =>
        prisma.accountInvitation.create({
          data: {
            accountId: id,
            invitedById: owner,
            email: 'friend@example.com',
            role: 'VIEWER',
            tokenHash,
            expiresAt: new Date(Date.now() + 1000),
          },
        });
      await invite(randomUUID());
      await expect(invite(randomUUID())).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('keeps a member’s transactions when they delete their user, so the balance holds', async () => {
      const owner = await user('owner');
      const member = await user('member');
      const { id } = await account(owner);
      await join(id, member, 'EDITOR');
      const entered = await transaction(owner, member, [
        { accountId: id, direction: 'DEBIT' },
      ]);

      await prisma.user.delete({ where: { id: member } });

      const kept = await prisma.transaction.findUnique({
        where: { id: entered.id },
        include: { items: true },
      });
      expect(kept).toMatchObject({ createdById: null, userId: owner });
      expect(kept?.items).toHaveLength(1);
      expect(
        await prisma.accountMember.count({ where: { accountId: id } }),
      ).toBe(0);
    });

    it('drops memberships and invitations with the account', async () => {
      const owner = await user('owner');
      const member = await user('member');
      const { id } = await account(owner);
      await join(id, member, 'VIEWER');
      await prisma.accountInvitation.create({
        data: {
          accountId: id,
          invitedById: owner,
          email: 'friend@example.com',
          role: 'VIEWER',
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 1000),
        },
      });

      await prisma.account.delete({ where: { id } });

      expect(
        await prisma.accountMember.count({ where: { accountId: id } }),
      ).toBe(0);
      expect(
        await prisma.accountInvitation.count({ where: { accountId: id } }),
      ).toBe(0);
    });
  });
});
