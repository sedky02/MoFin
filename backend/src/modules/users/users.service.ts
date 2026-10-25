import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { CreateUserInput, DeleteAccountDto, UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the user with the default categories in the same nested write, so
   * both land or neither does. Only a brand-new user row gets them, which keeps
   * this idempotent: a repeated registration never reaches here (or fails on
   * the unique email before anything is written).
   */
  createUser(input: CreateUserInput) {
    return this.prisma.user.create({
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
      select: { id: true, email: true, displayName: true, settings: true, createdAt: true, updatedAt: true, passwordHash: true }
    });
    if (!user) throw new NotFoundException('User not found');
    return withHasPassword(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...dto, settings: dto.settings as Prisma.InputJsonValue | undefined },
      select: { id: true, email: true, displayName: true, settings: true, updatedAt: true, passwordHash: true }
    });
    return withHasPassword(user);
  }

  /**
   * Deletes the account and everything that belongs to it, for good.
   *
   * The caller proves intent with the current password, or, for a Google-only
   * account (no password), by typing the account's email. A wrong proof is a
   * 400 field error and nothing is touched.
   *
   * Every user-owned table is cleared explicitly, children before parents, in
   * one transaction, before the user row goes. The schema cascades most of
   * these from User, but not all in a safe order: ledger items and recurring
   * roots reference accounts with RESTRICT, which Postgres checks at once
   * rather than at the end of the statement, so a single cascading
   * `user.delete` can fail depending on which branch it walks first. Soft-deleted transactions go too (no `deletedAt` filter).
   * Global categories (`userId: null`) never match `userId`, so they stay.
   *
   * Access tokens already issued (web and MCP) are stateless and stay valid
   * until their short TTL ends, but there is nothing left for them to read,
   * and no refresh token survives to renew them.
   */
  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException();

    if (user.passwordHash) {
      if (!dto.password) throw fieldError('password', 'Enter your password to confirm.');
      if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
        throw fieldError('password', 'The password is incorrect.');
      }
    } else if (dto.confirmEmail?.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw fieldError('confirmEmail', "Type your account's email to confirm.");
    }

    await this.deleteUserData(userId);
  }

  /**
   * Clears every user-owned table, children before parents, then the user
   * row, in one transaction (see `deleteAccount` for why the order matters).
   * No proof of intent here: callers check it first. The demo seed uses this
   * to reset its account.
   */
  async deleteUserData(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
      // Sessions and credentials: web, OAuth (MCP connectors) and reset links.
      await tx.refreshToken.deleteMany({ where: mine });
      await tx.authSession.deleteMany({ where: mine });
      await tx.passwordResetToken.deleteMany({ where: mine });
      await tx.oAuthRefreshToken.deleteMany({ where: mine });
      await tx.authorizationCode.deleteMany({ where: mine });
      await tx.oAuthGrant.deleteMany({ where: mine });
      // Anything created by a request racing this one still cascades from here.
      await tx.user.delete({ where: { id: userId } });
    });
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

/** A 400 shaped like the validation pipe's, so the web form shows it on the field. */
function fieldError(path: string, message: string): BadRequestException {
  return new BadRequestException({ message: 'Validation failed', errors: [{ path, message }] });
}
