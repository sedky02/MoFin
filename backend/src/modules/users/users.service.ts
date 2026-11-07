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

  /** Default categories are created in the same write, so both land or neither does. */
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
        emailVerifiedAt: true,
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
   * Deletes for good; the controller already required the typed word. See clearOwnedData for why
   * every table is cleared by hand. Issued access tokens expire on their own.
   */
  async deleteAccount(userId: string): Promise<void> {
    await this.requireUser(userId);
    await this.deleteUserData(userId);
  }

  /**
   * Keeps the user row, web sessions and connected AI apps (nobody is signed out, no app needs
   * reconnecting); gives back the starter categories and unsets the main account.
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
   * Children before parents, then the user, in one transaction. Callers check intent first; the
   * demo seed uses this to reset its account.
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
      await tx.pushDevice.deleteMany({ where: mine });
      await tx.aiCredential.deleteMany({ where: mine });
      // Anything created by a request racing this one still cascades from here.
      await tx.user.delete({ where: { id: userId } });
    });
  }

  /**
   * Cleared by hand, children before parents: ledger items and recurring roots reference accounts
   * with RESTRICT, so one cascading user.delete can fail. Member accounts keep their transactions.
   */
  private async clearOwnedData(tx: Prisma.TransactionClient, userId: string) {
    const mine = { userId };
    const affected = await tx.accountMember.findMany({
      where: { account: mine },
      select: { userId: true },
    });
    if (affected.length) {
      await tx.analyticsCache.deleteMany({
        where: { userId: { in: affected.map((member) => member.userId) } },
      });
    }
    await tx.accountMember.deleteMany({ where: mine });
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
    await tx.aiChat.deleteMany({ where: mine });
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

/** Lets the client tell a Google-only account without ever seeing the hash. */
function withHasPassword<T extends { passwordHash: string | null }>(user: T) {
  const { passwordHash, ...profile } = user;
  return { ...profile, hasPassword: passwordHash !== null };
}
