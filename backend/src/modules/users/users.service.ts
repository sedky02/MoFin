import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { CreateUserInput, UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the user with the default categories in the same nested write, so
   * both land or neither does. Only a brand-new user row gets them, which keeps
   * this idempotent: a repeated registration never reaches here (or fails on
   * the unique email before anything is written).
   */
  createUser(
    input: CreateUserInput,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    return db.user.create({
      data: {
        ...input,
        categories: { createMany: { data: [...DEFAULT_CATEGORIES] } },
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        // The web app shows a demo banner and disables what the demo blocks.
        isDemo: true,
        expiresAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return withHasPassword(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...dto,
        settings: dto.settings as Prisma.InputJsonValue | undefined,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        settings: true,
        updatedAt: true,
        passwordHash: true,
      },
    });
    return withHasPassword(user);
  }

  /**
   * Deletes the account and everything that belongs to it, for good. The
   * caller has already confirmed (the controller needs the typed word); there
   * is no password to check, since a Google-only account has none.
   *
   * See `clearOwnedData` for why every table is cleared by hand, in order.
   * Access tokens already issued (web and MCP) are stateless and stay valid
   * until their short TTL ends, but there is nothing left for them to read,
   * and no refresh token survives to renew them.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.requireUser(userId);
    await this.deleteUserData(userId);
  }

  /**
   * Starts the account over: everything it recorded is deleted for good, and
   * the account itself stays. Kept: the user row (email, name, sign-in
   * methods, settings), web sessions, and the connected AI apps (OAuth
   * grants and their tokens), so nobody is signed out and no app has to be
   * connected again. Like a new account, it gets the starter categories back,
   * and its main account (a setting that pointed at a deleted account) is unset.
   */
  async resetData(userId: string): Promise<void> {
    await this.requireUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.clearOwnedData(tx, userId);
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((category) => ({ ...category, userId })),
      });
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { settings: true },
      });
      const { mainAccountId: _gone, ...settings } = (user?.settings ??
        {}) as Record<string, unknown>;
      void _gone;
      await tx.user.update({
        where: { id: userId },
        data: { settings: settings as Prisma.InputJsonValue },
      });
    });
  }

  /**
   * Clears every user-owned table, children before parents, then the user
   * row, in one transaction. No proof of intent here: callers check it
   * first. The demo seed uses this to reset its account.
   */
  async deleteUserData(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.clearOwnedData(tx, userId);
      const mine = { userId };
      // Sessions and credentials: web, OAuth (MCP connectors) and emailed links.
      await tx.refreshToken.deleteMany({ where: mine });
      await tx.authSession.deleteMany({ where: mine });
      await tx.passwordResetToken.deleteMany({ where: mine });
      await tx.emailVerificationToken.deleteMany({ where: mine });
      await tx.oAuthRefreshToken.deleteMany({ where: mine });
      await tx.authorizationCode.deleteMany({ where: mine });
      await tx.oAuthGrant.deleteMany({ where: mine });
      // Anything created by a request racing this one still cascades from here.
      await tx.user.delete({ where: { id: userId } });
    });
  }

  /**
   * Deletes what the user recorded: ledger, transactions, drafts, goals,
   * budgets, accounts, categories and cached summaries; sign-ins and the
   * profile are left to the caller.
   *
   * Every table is cleared explicitly, children before parents. The schema
   * cascades most of these from User, but not all in a safe order: ledger
   * items and recurring roots reference accounts with RESTRICT, which
   * Postgres checks at once rather than at the end of the statement, so a
   * single cascading `user.delete` can fail depending on which branch it
   * walks first. Soft-deleted transactions go too (no `deletedAt` filter).
   * Global categories (`userId: null`) never match `userId`, so they stay.
   */
  private async clearOwnedData(tx: Prisma.TransactionClient, userId: string) {
    const mine = { userId };
    // Ledger first: items reference accounts (RESTRICT) and transactions.
    await tx.transactionItem.deleteMany({ where: mine });
    // Live and soft-deleted, occurrences and recurring roots (whose
    // template accounts are RESTRICT too). Drafts are unlinked by this.
    await tx.transaction.deleteMany({ where: mine });
    await tx.draftTransaction.deleteMany({ where: mine });
    await tx.goalInstance.deleteMany({ where: { goal: mine } });
    await tx.goal.deleteMany({ where: mine });
    await tx.budget.deleteMany({ where: mine });
    await tx.account.deleteMany({ where: mine });
    await tx.category.deleteMany({ where: mine });
    await tx.analyticsCache.deleteMany({ where: mine });
  }

  /** A 401 when the account is already gone (its access token outlives it by minutes). */
  private async requireUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException();
  }
}

/**
 * Swaps the password hash for `hasPassword`, so the client can tell a
 * Google-only account (no password to change) without ever seeing the hash.
 */
function withHasPassword<T extends { passwordHash: string | null }>(user: T) {
  const { passwordHash, ...profile } = user;
  return { ...profile, hasPassword: passwordHash !== null };
}
