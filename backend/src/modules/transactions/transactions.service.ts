import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TransactionType } from '@prisma/client';
import { DomainEvents, TransactionCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateTransactionCommand } from './dto/transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly categoriesService: CategoriesService,
    private readonly events: EventEmitter2
  ) {}

  async create(userId: string, command: CreateTransactionCommand) {
    this.validateCommand(command);
    await this.categoriesService.assertAvailable(userId, command.categoryId);
    const ledgerEntries = await this.ledgerService.buildEntriesForCommand(userId, command);

    const transaction = await this.prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          userId,
          draftId: command.draftId,
          type: command.type,
          description: command.description,
          currency: command.currency,
          categoryId: command.categoryId,
          occurredAt: command.occurredAt
        }
      });

      await this.ledgerService.createEntries(db, userId, created.id, ledgerEntries);
      return db.transaction.findUniqueOrThrow({ where: { id: created.id }, include: { items: true, category: true } });
    });

    this.events.emit(DomainEvents.TransactionCreated, {
      transactionId: transaction.id,
      userId,
      occurredAt: transaction.occurredAt
    } satisfies TransactionCreatedEvent);

    return transaction;
  }

  async getById(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { items: true, category: true }
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  private validateCommand(command: CreateTransactionCommand) {
    if (new Prisma.Decimal(command.amount).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (command.type === TransactionType.INCOME && !command.toAccountId) {
      throw new BadRequestException('Income requires toAccountId');
    }
    if (command.type === TransactionType.EXPENSE && !command.fromAccountId) {
      throw new BadRequestException('Expense requires fromAccountId');
    }
    if (command.type === TransactionType.TRANSFER && (!command.fromAccountId || !command.toAccountId)) {
      throw new BadRequestException('Transfer requires fromAccountId and toAccountId');
    }
    if (command.type === TransactionType.TRANSFER && command.fromAccountId === command.toAccountId) {
      throw new BadRequestException('Transfer accounts must be different');
    }
  }
}
