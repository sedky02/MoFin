/**
 * Invitations, membership, ownership transfer and email verification against real Postgres. Needs
 * TEST_DATABASE_URL (see support/test-database.ts).
 */
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/database/prisma.service';
import { AccountAccessService } from '../src/modules/account-access/account-access.service';
import {
  INVITATION_TTL_MS,
  InvitationsService,
  MAX_PENDING_INVITATIONS,
} from '../src/modules/account-sharing/invitations.service';
import { MembersService } from '../src/modules/account-sharing/members.service';
import {
  OwnershipService,
  SERIES_SPLIT_REASON,
} from '../src/modules/account-sharing/ownership.service';
import { EmailVerificationService } from '../src/modules/auth/email-verification.service';
import { MailMessage, MailSender } from '../src/modules/mail/mail-sender';
import { testDatabaseUrl } from './support/test-database';

class FakeMail extends MailSender {
  sent: MailMessage[] = [];
  working = true;
  deliversMail = true;

  get delivers() {
    return this.deliversMail;
  }

  send(message: MailMessage) {
    if (!this.working) return Promise.reject(new Error('relay down'));
    this.sent.push(message);
    return Promise.resolve();
  }

  lastToken() {
    return this.sent.at(-1)!.text.match(/#token=(\S+)/)![1];
  }
}

const VERIFIED = new Date('2026-01-01');

describe('Account sharing (Postgres)', () => {
  let prisma: PrismaService;
  let access: AccountAccessService;
  let invitations: InvitationsService;
  let members: MembersService;
  let ownership: OwnershipService;
  let verification: EmailVerificationService;
  let events: EventEmitter2;
  let mail: FakeMail;
  const users: string[] = [];

  async function user(name: string, verified = true) {
    const id = randomUUID();
    users.push(id);
    const email = `${name}-${id}@example.com`;
    await prisma.user.create({
      data: { id, email, emailVerifiedAt: verified ? VERIFIED : null },
    });
    return { id, email };
  }

  const account = (userId: string, name = 'Joint') =>
    prisma.account.create({
      data: { userId, name, type: 'BANK', currency: 'EUR' },
    });

  async function setup(options: { verified?: boolean } = {}) {
    const owner = await user('owner');
    const guest = await user('guest', options.verified ?? true);
    const { id: accountId } = await account(owner.id);
    await invitations.create(owner, accountId, {
      email: guest.email,
      role: 'EDITOR',
    });
    return { owner, guest, accountId, token: mail.lastToken() };
  }

  async function shared() {
    const context = await setup();
    await invitations.accept(context.guest.id, context.token);
    return context;
  }

  const expense = (userId: string, accountId: string, categoryId?: string) =>
    prisma.transaction.create({
      data: {
        userId,
        createdById: userId,
        type: 'EXPENSE',
        description: 'Groceries',
        currency: 'EUR',
        occurredAt: new Date(),
        categoryId,
        items: {
          create: {
            userId,
            accountId,
            categoryId,
            direction: 'DEBIT',
            amount: new Prisma.Decimal(10),
            currency: 'EUR',
          },
        },
      },
    });

  const transfer = (
    userId: string,
    from: string,
    to: string,
    data: Partial<Prisma.TransactionUncheckedCreateInput> = {},
  ) =>
    prisma.transaction.create({
      data: {
        userId,
        createdById: userId,
        type: 'TRANSFER',
        description: 'Savings',
        currency: 'EUR',
        occurredAt: new Date(),
        ...data,
        items: {
          create: [
            {
              userId,
              accountId: from,
              direction: 'DEBIT',
              amount: new Prisma.Decimal(25),
              currency: 'EUR',
            },
            {
              userId,
              accountId: to,
              direction: 'CREDIT',
              amount: new Prisma.Decimal(25),
              currency: 'EUR',
            },
          ],
        },
      },
    });

  /** Signed balance from the ledger alone, whoever's rows they are. */
  async function balance(accountId: string) {
    const items = await prisma.transactionItem.findMany({
      where: { accountId },
    });
    return items.reduce(
      (sum, item) =>
        item.direction === 'CREDIT'
          ? sum.plus(item.amount)
          : sum.minus(item.amount),
      new Prisma.Decimal(0),
    );
  }

  beforeAll(() => {
    prisma = new PrismaService({
      getOrThrow: () => testDatabaseUrl(),
    } as unknown as ConfigService);
    access = new AccountAccessService(prisma);
    mail = new FakeMail();
    events = new EventEmitter2();
    const config = {
      get: (_key: string, fallback: string) => fallback,
    } as unknown as ConfigService;
    invitations = new InvitationsService(prisma, access, mail, config, events);
    members = new MembersService(prisma, access, events);
    ownership = new OwnershipService(prisma, access, mail, events);
    verification = new EmailVerificationService(prisma, mail, config);
  });

  afterAll(async () => {
    await prisma.transactionItem.deleteMany({
      where: { userId: { in: users } },
    });
    await prisma.transaction.deleteMany({ where: { userId: { in: users } } });
    await prisma.account.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  describe('creating an invitation', () => {
    it('emails a link and stores only the hash of its token', async () => {
      const { accountId, token, guest } = await setup();
      const row = await prisma.accountInvitation.findFirstOrThrow({
        where: { accountId },
      });
      expect(mail.sent.at(-1)?.to).toBe(guest.email);
      expect(row.tokenHash).not.toBe(token);
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('expires in seven days', async () => {
      const { accountId } = await setup();
      const row = await prisma.accountInvitation.findFirstOrThrow({
        where: { accountId },
      });
      const left = row.expiresAt.getTime() - Date.now();
      expect(left).toBeGreaterThan(INVITATION_TTL_MS - 60_000);
      expect(left).toBeLessThanOrEqual(INVITATION_TTL_MS);
    });

    it('never returns the token or its hash', async () => {
      const owner = await user('owner');
      const { id } = await account(owner.id);
      const response = await invitations.create(owner, id, {
        email: 'a@example.com',
        role: 'VIEWER',
      });
      expect(response).not.toHaveProperty('tokenHash');
      expect(JSON.stringify(response)).not.toContain(mail.lastToken());
    });

    it('answers the same whether or not the address has a MoFin account', async () => {
      const owner = await user('owner');
      const known = await user('known');
      const { id } = await account(owner.id);
      const shape = (response: object) => Object.keys(response).sort();
      expect(
        shape(
          await invitations.create(owner, id, {
            email: known.email,
            role: 'VIEWER',
          }),
        ),
      ).toEqual(
        shape(
          await invitations.create(owner, id, {
            email: `nobody-${randomUUID()}@example.com`,
            role: 'VIEWER',
          }),
        ),
      );
    });

    it('escapes names in the HTML part of the email', async () => {
      const owner = await user('owner');
      const { id } = await account(owner.id, '<b>Joint</b>');
      await invitations.create(owner, id, {
        email: 'a@example.com',
        role: 'VIEWER',
      });
      expect(mail.sent.at(-1)?.html).toContain('&lt;b&gt;Joint&lt;/b&gt;');
    });

    it('refuses the owner’s own address and an existing member', async () => {
      const { owner, guest, accountId } = await shared();
      await expect(
        invitations.create(owner, accountId, {
          email: owner.email,
          role: 'VIEWER',
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        invitations.create(owner, accountId, {
          email: guest.email,
          role: 'VIEWER',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('is for the owner alone', async () => {
      const { guest, accountId } = await shared();
      const stranger = await user('stranger');
      const dto = { email: 'a@example.com', role: 'VIEWER' as const };
      await expect(
        invitations.create(guest, accountId, dto),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        invitations.create(stranger, accountId, dto),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('caps pending invitations per account', async () => {
      const owner = await user('owner');
      const { id } = await account(owner.id);
      await prisma.accountInvitation.createMany({
        data: Array.from({ length: MAX_PENDING_INVITATIONS }, (_, i) => ({
          accountId: id,
          invitedById: owner.id,
          email: `p${i}@example.com`,
          role: 'VIEWER' as const,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
        })),
      });
      await expect(
        invitations.create(owner, id, {
          email: 'one-more@example.com',
          role: 'VIEWER',
        }),
      ).rejects.toMatchObject({ status: 429 });
    });

    it('says so when email can’t be delivered, and leaves nothing usable', async () => {
      const owner = await user('owner');
      const { id } = await account(owner.id);
      const dto = { email: 'a@example.com', role: 'VIEWER' as const };

      mail.deliversMail = false;
      await expect(invitations.create(owner, id, dto)).rejects.toMatchObject({
        status: 503,
      });
      mail.deliversMail = true;
      expect(
        await prisma.accountInvitation.count({ where: { accountId: id } }),
      ).toBe(0);

      mail.working = false;
      await expect(invitations.create(owner, id, dto)).rejects.toMatchObject({
        status: 503,
      });
      mail.working = true;
      expect(await invitations.listPending(owner.id, id)).toEqual([]);
    });
  });

  describe('reinviting', () => {
    it('replaces the pending invitation: the old link dies, the new role applies', async () => {
      const { owner, guest, accountId, token } = await setup();
      await invitations.create(owner, accountId, {
        email: guest.email,
        role: 'VIEWER',
      });
      const fresh = mail.lastToken();

      await expect(invitations.preview(token)).rejects.toMatchObject({
        status: 400,
      });
      expect(await invitations.listPending(owner.id, accountId)).toHaveLength(
        1,
      );
      await expect(invitations.accept(guest.id, fresh)).resolves.toMatchObject({
        role: 'VIEWER',
      });
    });
  });

  describe('accepting', () => {
    it('makes the invited, verified user a member with the chosen role', async () => {
      const { guest, accountId, token } = await setup();
      await invitations.accept(guest.id, token);
      await expect(
        access.assertAccess(guest.id, accountId, 'transact'),
      ).resolves.toMatchObject({ role: 'EDITOR' });
    });

    it('refuses someone signed in with another address, even with the link', async () => {
      const { accountId, token } = await setup();
      const other = await user('other');
      await expect(invitations.accept(other.id, token)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        access.assertAccess(other.id, accountId, 'view'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('refuses an unverified address until it is verified', async () => {
      const { guest, token } = await setup({ verified: false });
      await expect(invitations.accept(guest.id, token)).rejects.toMatchObject({
        status: 403,
        response: { code: 'EMAIL_NOT_VERIFIED' },
      });

      await verification.sendLink(guest.id);
      await verification.verify(mail.lastToken());

      await expect(invitations.accept(guest.id, token)).resolves.toMatchObject({
        role: 'EDITOR',
      });
    });

    it('works once', async () => {
      const { guest, token } = await shared();
      await expect(invitations.accept(guest.id, token)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('lets only one of two concurrent accepts through', async () => {
      const { guest, accountId, token } = await setup();
      const results = await Promise.allSettled([
        invitations.accept(guest.id, token),
        invitations.accept(guest.id, token),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.accountMember.count({ where: { accountId } })).toBe(
        1,
      );
    });

    it('refuses an expired invitation', async () => {
      const { guest, accountId, token } = await setup();
      await prisma.accountInvitation.updateMany({
        where: { accountId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(invitations.accept(guest.id, token)).rejects.toMatchObject({
        status: 400,
      });
      await expect(invitations.preview(token)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('refuses a revoked invitation', async () => {
      const { owner, guest, accountId, token } = await setup();
      const [{ id }] = await invitations.listPending(owner.id, accountId);
      await invitations.revoke(owner.id, accountId, id);
      await expect(invitations.accept(guest.id, token)).rejects.toMatchObject({
        status: 400,
      });
      expect(await invitations.listPending(owner.id, accountId)).toEqual([]);
    });

    it('refuses an invitation to an archived account', async () => {
      const { guest, accountId, token } = await setup();
      await prisma.account.update({
        where: { id: accountId },
        data: { archivedAt: new Date() },
      });
      await expect(invitations.accept(guest.id, token)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('refuses a token nobody issued', async () => {
      await expect(invitations.preview('made-up')).rejects.toMatchObject({
        status: 400,
      });
    });

    it('tells listeners, so the member’s cached figures are dropped', async () => {
      const heard: unknown[] = [];
      const listener = (event: unknown) => heard.push(event);
      events.on('account.access-changed', listener);
      const { guest } = await shared();
      events.off('account.access-changed', listener);
      expect(heard).toEqual([{ userIds: [guest.id] }]);
    });
  });

  describe('declining', () => {
    it('needs only the token, and spends it', async () => {
      const { guest, accountId, token } = await setup();
      await invitations.decline(token);
      await expect(invitations.accept(guest.id, token)).rejects.toMatchObject({
        status: 400,
      });
      expect(await prisma.accountMember.count({ where: { accountId } })).toBe(
        0,
      );
    });
  });

  describe('previewing', () => {
    it('shows what the accept screen needs', async () => {
      const { owner, guest, token } = await setup();
      await expect(invitations.preview(token)).resolves.toMatchObject({
        accountName: 'Joint',
        invitedBy: owner.email,
        email: guest.email,
        role: 'EDITOR',
      });
    });
  });

  describe('managing members', () => {
    it('lets the owner change a role and remove a member', async () => {
      const { owner, guest, accountId } = await shared();
      await members.changeRole(owner.id, accountId, guest.id, 'VIEWER');
      await expect(
        access.assertAccess(guest.id, accountId, 'transact'),
      ).rejects.toMatchObject({ status: 403 });

      await members.remove(owner.id, accountId, guest.id);
      await expect(
        access.assertAccess(guest.id, accountId, 'view'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('is for the owner alone, and the owner is not a member to remove', async () => {
      const { owner, guest, accountId } = await shared();
      await expect(
        members.changeRole(guest.id, accountId, guest.id, 'EDITOR'),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        members.remove(guest.id, accountId, owner.id),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        members.remove(owner.id, accountId, owner.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lets a member leave, not the owner', async () => {
      const { owner, guest, accountId } = await shared();
      await expect(members.leave(owner.id, accountId)).rejects.toMatchObject({
        status: 403,
      });
      await members.leave(guest.id, accountId);
      await expect(
        access.assertAccess(guest.id, accountId, 'view'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('shows addresses to the owner, and to others only their own', async () => {
      const { owner, guest, accountId } = await shared();
      const asOwner = await members.list(owner.id, accountId);
      expect(asOwner.map((m) => [m.role, m.email])).toEqual([
        ['OWNER', owner.email],
        ['EDITOR', guest.email],
      ]);
      const asGuest = await members.list(guest.id, accountId);
      expect(asGuest.map((m) => [m.role, m.email, m.isYou])).toEqual([
        ['OWNER', null, false],
        ['EDITOR', guest.email, true],
      ]);
    });

    it('keeps each person’s visibility level their own', async () => {
      const { owner, guest, accountId } = await shared();
      await prisma.account.update({
        where: { id: accountId },
        data: { metadata: { other: 1 } },
      });
      await members.setVisibility(guest.id, accountId, 'private');
      expect(
        (await prisma.account.findUniqueOrThrow({ where: { id: accountId } }))
          .metadata,
      ).toEqual({ other: 1 });

      await members.setVisibility(owner.id, accountId, 'masked');
      expect(
        (await prisma.account.findUniqueOrThrow({ where: { id: accountId } }))
          .metadata,
      ).toEqual({ other: 1, visibility: 'masked' });
      await expect(
        prisma.accountMember.findUniqueOrThrow({
          where: { accountId_userId: { accountId, userId: guest.id } },
        }),
      ).resolves.toMatchObject({ visibility: 'private' });
    });

    it('lists what the delete warning needs: owned accounts others can reach', async () => {
      const { owner, guest, accountId } = await shared();
      await account(owner.id, 'Alone');
      const listed = await members.sharedAccountsOwnedBy(owner.id);
      expect(listed.map((a) => a.id)).toEqual([accountId]);
      expect(listed[0].members.map((m) => m.email)).toEqual([guest.email]);
      expect(await members.sharedAccountsOwnedBy(guest.id)).toEqual([]);
    });
  });

  describe('transferring ownership', () => {
    it('swaps the two people: the member owns it, the old owner edits it', async () => {
      const { owner, guest, accountId } = await shared();
      await ownership.transfer(owner.id, accountId, guest.id);
      await expect(
        access.assertAccess(guest.id, accountId, 'manage'),
      ).resolves.toMatchObject({ role: 'OWNER' });
      await expect(
        access.assertAccess(owner.id, accountId, 'transact'),
      ).resolves.toMatchObject({ role: 'EDITOR' });
      expect(
        await prisma.accountMember.count({
          where: { accountId, userId: guest.id },
        }),
      ).toBe(0);
    });

    it('is for the owner, and only to a member', async () => {
      const { owner, guest, accountId } = await shared();
      const stranger = await user('stranger');
      await expect(
        ownership.transfer(guest.id, accountId, guest.id),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        ownership.transfer(owner.id, accountId, stranger.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        ownership.transfer(stranger.id, accountId, guest.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('moves the ledger, goals and pending invitations, and every balance stays exact', async () => {
      const { owner, guest, accountId } = await shared();
      const { id: other } = await account(owner.id, 'Private');
      const { id: third } = await account(owner.id, 'Third');
      await expense(owner.id, accountId);
      await transfer(owner.id, accountId, other);
      await transfer(owner.id, other, third);
      await prisma.goal.create({
        data: {
          userId: owner.id,
          accountId,
          name: 'Trip',
          type: 'BALANCE',
          targetAmount: new Prisma.Decimal(100),
          periodStart: new Date(),
        },
      });
      await invitations.create(owner, accountId, {
        email: 'later@example.com',
        role: 'VIEWER',
      });
      const before = await Promise.all(
        [accountId, other, third].map((id) => balance(id)),
      );

      await ownership.transfer(owner.id, accountId, guest.id);

      const after = await Promise.all(
        [accountId, other, third].map((id) => balance(id)),
      );
      expect(after.map(String)).toEqual(before.map(String));
      expect(
        await prisma.transactionItem.count({
          where: { accountId, NOT: { userId: guest.id } },
        }),
      ).toBe(0);
      expect(
        await prisma.transaction.count({
          where: {
            items: { some: { accountId } },
            NOT: { userId: guest.id },
          },
        }),
      ).toBe(0);
      expect(
        await prisma.goal.count({ where: { accountId, userId: guest.id } }),
      ).toBe(1);
      expect(
        await prisma.accountInvitation.count({
          where: { accountId, status: 'PENDING', invitedById: guest.id },
        }),
      ).toBe(1);
      // A transfer between the old owner's other accounts is left alone.
      expect(
        await prisma.transaction.count({
          where: {
            userId: owner.id,
            AND: [
              { items: { some: { accountId: other } } },
              { items: { some: { accountId: third } } },
            ],
          },
        }),
      ).toBe(1);
    });

    it('splits a transfer that would span two owners, soft-deleted ones too', async () => {
      const { owner, guest, accountId } = await shared();
      const { id: other } = await account(owner.id, 'Private');
      const live = await transfer(owner.id, accountId, other);
      const deletedAt = new Date();
      await transfer(owner.id, other, accountId, { deletedAt });

      await ownership.transfer(owner.id, accountId, guest.id);

      const kept = await prisma.transaction.findUniqueOrThrow({
        where: { id: live.id },
        include: { items: true },
      });
      expect(kept.userId).toBe(owner.id);
      expect(kept.items.map((i) => i.accountId)).toEqual([other]);

      const sides = await prisma.transaction.findMany({
        where: { userId: guest.id },
        include: { items: true },
      });
      expect(sides).toHaveLength(2);
      for (const side of sides) {
        expect(side.type).toBe('TRANSFER');
        expect(side.items).toHaveLength(1);
        expect(side.items[0]).toMatchObject({ accountId, userId: guest.id });
      }
      expect(sides.filter((s) => s.deletedAt).length).toBe(1);
    });

    it('leaves nothing behind that blocks either person deleting their data', async () => {
      const { owner, guest, accountId } = await shared();
      const { id: other } = await account(owner.id, 'Private');
      await transfer(owner.id, accountId, other, {
        isRecurring: true,
        recurringInterval: 'MONTHLY',
        recurringStatus: 'ACTIVE',
        recurringFromAccountId: accountId,
        recurringToAccountId: other,
      });

      await ownership.transfer(owner.id, accountId, guest.id);

      // What UsersService clears, for the new owner: their account must go cleanly.
      await prisma.transactionItem.deleteMany({ where: { userId: guest.id } });
      await prisma.transaction.deleteMany({ where: { userId: guest.id } });
      await expect(
        prisma.account.delete({ where: { id: accountId } }),
      ).resolves.toBeDefined();
    });

    it('pauses a series across the two owners and clears the side that left', async () => {
      const { owner, guest, accountId } = await shared();
      const { id: other } = await account(owner.id, 'Private');
      const root = await transfer(owner.id, other, accountId, {
        isRecurring: true,
        recurringInterval: 'MONTHLY',
        recurringStatus: 'ACTIVE',
        recurringFromAccountId: other,
        recurringToAccountId: accountId,
      });

      await ownership.transfer(owner.id, accountId, guest.id);

      await expect(
        prisma.transaction.findUniqueOrThrow({ where: { id: root.id } }),
      ).resolves.toMatchObject({
        userId: owner.id,
        recurringStatus: 'PAUSED',
        recurringError: SERIES_SPLIT_REASON,
        recurringFromAccountId: other,
        recurringToAccountId: null,
      });
    });

    it('catches a series whose template points away from its own ledger legs', async () => {
      const { owner, guest, accountId } = await shared();
      const { id: other } = await account(owner.id, 'Private');
      const root = await expense(owner.id, accountId);
      await prisma.transaction.update({
        where: { id: root.id },
        data: {
          isRecurring: true,
          recurringInterval: 'MONTHLY',
          recurringStatus: 'ACTIVE',
          recurringFromAccountId: other,
        },
      });

      await ownership.transfer(owner.id, accountId, guest.id);

      await expect(
        prisma.transaction.findUniqueOrThrow({ where: { id: root.id } }),
      ).resolves.toMatchObject({
        userId: guest.id,
        recurringStatus: 'PAUSED',
        recurringFromAccountId: null,
      });
    });

    it('leaves a series that stays on the account running', async () => {
      const { owner, guest, accountId } = await shared();
      const root = await expense(owner.id, accountId);
      await prisma.transaction.update({
        where: { id: root.id },
        data: {
          isRecurring: true,
          recurringInterval: 'MONTHLY',
          recurringStatus: 'ACTIVE',
          recurringFromAccountId: accountId,
        },
      });

      await ownership.transfer(owner.id, accountId, guest.id);

      await expect(
        prisma.transaction.findUniqueOrThrow({ where: { id: root.id } }),
      ).resolves.toMatchObject({
        userId: guest.id,
        recurringStatus: 'ACTIVE',
        recurringFromAccountId: accountId,
      });
    });

    it('moves categories to the new owner: their own by name, otherwise a copy', async () => {
      const { owner, guest, accountId } = await shared();
      const same = await prisma.category.create({
        data: { userId: owner.id, name: 'Food', type: 'EXPENSE' },
      });
      const theirs = await prisma.category.create({
        data: { userId: guest.id, name: 'Food', type: 'EXPENSE' },
      });
      const onlyOwner = await prisma.category.create({
        data: {
          userId: owner.id,
          name: 'Pets',
          type: 'EXPENSE',
          color: '#123456',
        },
      });
      const food = await expense(owner.id, accountId, same.id);
      const pets = await expense(owner.id, accountId, onlyOwner.id);

      await ownership.transfer(owner.id, accountId, guest.id);

      const after = (id: string) =>
        prisma.transaction.findUniqueOrThrow({
          where: { id },
          include: { items: true, category: true },
        });
      const moved = await after(food.id);
      expect(moved.categoryId).toBe(theirs.id);
      expect(moved.items[0].categoryId).toBe(theirs.id);

      const copied = await after(pets.id);
      expect(copied.category).toMatchObject({
        userId: guest.id,
        name: 'Pets',
        color: '#123456',
      });
      expect(await prisma.category.count({ where: { id: onlyOwner.id } })).toBe(
        1,
      );
    });

    it('swaps the visibility levels with the roles', async () => {
      const { owner, guest, accountId } = await shared();
      await members.setVisibility(owner.id, accountId, 'hidden');
      await ownership.transfer(owner.id, accountId, guest.id);
      const row = await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
      });
      expect(row.metadata).toEqual({});
      await expect(
        prisma.accountMember.findUniqueOrThrow({
          where: { accountId_userId: { accountId, userId: owner.id } },
        }),
      ).resolves.toMatchObject({ visibility: 'hidden' });
    });

    it('lets only one of two concurrent handovers through', async () => {
      const { owner, guest, accountId } = await shared();
      const third = await user('third');
      await prisma.accountMember.create({
        data: { accountId, userId: third.id, role: 'VIEWER' },
      });
      const results = await Promise.allSettled([
        ownership.transfer(owner.id, accountId, guest.id),
        ownership.transfer(owner.id, accountId, third.id),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const row = await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
      });
      expect(row.userId).not.toBe(owner.id);
      expect(
        await prisma.accountMember.count({
          where: { accountId, userId: row.userId },
        }),
      ).toBe(0);
    });

    it('tells the new owner by email, and a failed send undoes nothing', async () => {
      const { owner, guest, accountId } = await shared();
      mail.working = false;
      await ownership.transfer(owner.id, accountId, guest.id);
      mail.working = true;
      await expect(
        access.assertAccess(guest.id, accountId, 'manage'),
      ).resolves.toBeDefined();

      const next = await shared();
      await ownership.transfer(next.owner.id, next.accountId, next.guest.id);
      expect(mail.sent.at(-1)).toMatchObject({
        to: next.guest.email,
        subject: 'You now own an account on MoFin',
      });
    });
  });

  describe('verifying an email', () => {
    it('marks the address verified, once', async () => {
      const person = await user('person', false);
      await verification.sendLink(person.id);
      const token = mail.lastToken();
      await verification.verify(token);
      await expect(
        prisma.user.findUniqueOrThrow({ where: { id: person.id } }),
      ).resolves.toMatchObject({ emailVerifiedAt: expect.any(Date) as Date });
      await expect(verification.verify(token)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('supersedes the older link', async () => {
      const person = await user('person', false);
      await verification.sendLink(person.id);
      const old = mail.lastToken();
      await verification.sendLink(person.id);
      await expect(verification.verify(old)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('refuses an expired link', async () => {
      const person = await user('person', false);
      await verification.sendLink(person.id);
      await prisma.emailVerificationToken.updateMany({
        where: { userId: person.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(verification.verify(mail.lastToken())).rejects.toMatchObject(
        { status: 400 },
      );
    });

    it('sends nothing to an address already verified', async () => {
      const person = await user('person');
      const sent = mail.sent.length;
      await expect(verification.sendLink(person.id)).resolves.toEqual({
        alreadyVerified: true,
      });
      expect(mail.sent).toHaveLength(sent);
    });
  });
});
