import { Injectable, NotFoundException } from '@nestjs/common';
import { Account, AccountMemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AccountAction, accountScope } from '../account-access/account-access';
import { AccountAccessService } from '../account-access/account-access.service';
import {
  CreateAccountDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from './dto/accounts.dto';

// Undefined stays undefined: create falls back to the column's 0, update leaves it as is.
// Optional on the methods the demo seed uses, so it can run them inside its own
// transaction; every route omits it and keeps using this.prisma.
type Db = Prisma.TransactionClient;

type AccountWithAccess = Account & {
  members: { role: AccountMemberRole; hideAmount: boolean }[];
  user: { displayName: string | null };
  _count: { members: number };
};

/**
 * An account as `userId` sees it. `metadata` holds the owner's own choices, so
 * a member gets only theirs, in the same place clients already read it from.
 */
function accountView(row: AccountWithAccess, userId: string) {
  const { members, user, _count, ...account } = row;
  const isOwner = account.userId === userId;
  return {
    ...account,
    metadata: isOwner
      ? account.metadata
      : members[0].hideAmount
        ? { hideAmount: true }
        : {},
    role: isOwner ? 'OWNER' : members[0].role,
    isShared: _count.members > 0,
    memberCount: _count.members + 1,
    ownerName: user.displayName,
  };
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
   * The accounts `userId` can reach, their own and shared with them, each with
   * their role. `action` narrows it, as the draft flows do to the accounts they
   * may write to.
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
          select: { role: true, hideAmount: true },
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
    return this.prisma.account.update({
      where: { id: accountId },
      data: {
        ...dto,
        openingBalance: toDecimal(dto.openingBalance),
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
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
