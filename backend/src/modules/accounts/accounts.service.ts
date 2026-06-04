import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: { ...dto, userId, metadata: dto.metadata as Prisma.InputJsonValue | undefined }
    });
  }

  list(userId: string) {
    return this.prisma.account.findMany({ where: { userId, archivedAt: null }, orderBy: { createdAt: 'desc' } });
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
}
