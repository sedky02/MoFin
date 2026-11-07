import { Injectable, NotFoundException } from '@nestjs/common';
import { Account, AccountMemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountAction, accountScope } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import {
  accountVisibility,
  readVisibility,
  visibilityOfMetadata,
} from './account-visibility';
import {
  CreateAccountDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from './dto/accounts.dto';

// Optional on the methods the demo seed uses, so it can run them in its own transaction.
type Db = Prisma.TransactionClient;

type AccountWithAccess = Account & {
  members: { role: AccountMemberRole; visibility: string }[];
  user: { displayName: string | null };
  _count: { members: number };
};

/**
 * Everyone gets their own visibility level in `metadata`, where clients read it. `hideAmount` is
 * still sent for older app versions that only know the old flag.
 */
function accountView(row: AccountWithAccess, userId: string) {
  const { members, user, _count, ...account } = row;
  const isOwner = account.userId === userId;
  const visibility = isOwner
    ? visibilityOfMetadata(account.metadata)
    : readVisibility(members[0].visibility);
  return {
    ...account,
    metadata: {
      ...(isOwner ? (account.metadata as Record<string, unknown>) : {}),
      ...(visibility === 'visible' ? {} : { visibility }),
      ...(accountVisibility(visibility).countInTotals
        ? {}
        : { hideAmount: true }),
    },
    role: isOwner ? 'OWNER' : members[0].role,
    isShared: _count.members > 0,
    memberCount: _count.members + 1,
    ownerName: user.displayName,
  };
}

/** Older apps send `hideAmount` back with the rest of the metadata; it no longer means anything. */
function withoutLegacyFlag(metadata: Record<string, unknown>) {
  const { hideAmount: _legacy, ...rest } = metadata;
  void _legacy;
  return rest;
}

function toDecimal(amount: string | undefined): Prisma.Decimal | undefined {
  return amount === undefined ? undefined : new Prisma.Decimal(amount);
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
  ) {}

  create(userId: string, dto: CreateAccountDto, db: Db = this.prisma) {
    return db.account.create({
      data: {
        ...dto,
        userId,
        openingBalance: toDecimal(dto.openingBalance),
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * Own and shared accounts, each with the viewer's role; `action` narrows it (drafts only want
   * accounts they can write to).
   */
  async list(
    userId: string,
    query: ListAccountsQueryDto,
    action: AccountAction = 'view',
  ) {
    const archivedFilter =
      query.status === 'active'
        ? { archivedAt: null }
        : query.status === 'archived'
          ? { archivedAt: { not: null } }
          : {};
    const page = await this.prisma.paginated.account.paginate({
      where: { ...accountScope(userId, action), ...archivedFilter },
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          where: { userId },
          select: { role: true, visibility: true },
        },
        user: { select: { displayName: true } },
        _count: { select: { members: true } },
      },
      limit: query.limit,
      offset: query.offset,
    });
    return {
      ...page,
      // Cast for the same reason as GoalsService.list: paginate() loses the include's type.
      data: (page.data as AccountWithAccess[]).map((account) =>
        accountView(account, userId),
      ),
    };
  }

  async update(userId: string, accountId: string, dto: UpdateAccountDto) {
    await this.access.assertAccess(userId, accountId, 'manage', {
      activeOnly: true,
    });
    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        ...dto,
        openingBalance: toDecimal(dto.openingBalance),
        metadata: dto.metadata
          ? (withoutLegacyFlag(dto.metadata) as Prisma.InputJsonValue)
          : undefined,
      },
    });
    // "All accounts" figures depend on the owner's visibility level and are cached per person.
    if (dto.metadata) {
      await this.prisma.analyticsCache.deleteMany({ where: { userId } });
    }
    return updated;
  }

  /** Read-only for everyone on it until restored; the owner alone can do either. */
  async archive(userId: string, accountId: string) {
    await this.access.assertAccess(userId, accountId, 'manage', {
      activeOnly: true,
    });
    return this.prisma.account.update({
      where: { id: accountId },
      data: { archivedAt: new Date() },
    });
  }

  async restore(userId: string, accountId: string) {
    const { account } = await this.access.assertAccess(
      userId,
      accountId,
      'manage',
    );
    if (!account.archivedAt)
      throw new NotFoundException(`Archived account ${accountId} not found`);
    return this.prisma.account.update({
      where: { id: accountId },
      data: { archivedAt: null },
    });
  }
}
