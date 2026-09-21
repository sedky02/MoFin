import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAccountDto, ListAccountsQueryDto, UpdateAccountDto } from './dto/accounts.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: { ...dto, userId, metadata: dto.metadata as Prisma.InputJsonValue | undefined }
    });
  }

  list(userId: string, query: ListAccountsQueryDto) {
    const archivedFilter =
      query.status === 'active'
        ? { archivedAt: null }
        : query.status === 'archived'
          ? { archivedAt: { not: null } }
          : {};
    return this.prisma.paginated.account.paginate({
      where: { userId, ...archivedFilter },
      orderBy: { createdAt: 'desc' },
      limit: query.limit,
      offset: query.offset
    });
  }

  async assertOwned(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId, archivedAt: null } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    return account;
  }

  async update(userId: string, accountId: string, dto: UpdateAccountDto) {
    await this.assertOwned(userId, accountId);
    return this.prisma.account.update({
      where: { id: accountId },
      data: { ...dto, metadata: dto.metadata as Prisma.InputJsonValue | undefined }
    });
  }

  async archive(userId: string, accountId: string) {
    await this.assertOwned(userId, accountId);
    return this.prisma.account.update({ where: { id: accountId }, data: { archivedAt: new Date() } });
  }

  async restore(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId, archivedAt: { not: null } },
    });
    if (!account) throw new NotFoundException(`Archived account ${accountId} not found`);
    return this.prisma.account.update({ where: { id: accountId }, data: { archivedAt: null } });
  }
}
