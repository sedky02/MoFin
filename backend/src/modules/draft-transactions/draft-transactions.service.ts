import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DraftStatus, Prisma } from '@prisma/client';
import { DomainEvents, DraftApprovedEvent, DraftCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CreateDraftTransactionDto, DraftListQuery, ParsedDraftTransaction } from './dto/draft-transactions.dto';

@Injectable()
export class DraftTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsService: TransactionsService,
    private readonly events: EventEmitter2
  ) {}

  async create(userId: string, dto: CreateDraftTransactionDto) {
    const draft = await this.prisma.draftTransaction.create({
      data: {
        userId,
        rawInput: dto.rawInput,
        parsedData: dto.parsedData as unknown as Prisma.InputJsonValue,
        confidenceScore: new Prisma.Decimal(dto.confidenceScore)
      }
    });

    this.events.emit(DomainEvents.DraftCreated, { draftId: draft.id, userId } satisfies DraftCreatedEvent);
    return draft;
  }

  list(userId: string, query: DraftListQuery) {
    return this.prisma.draftTransaction.findMany({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit
    });
  }

  async approve(userId: string, draftId: string) {
    const draft = await this.prisma.draftTransaction.findFirst({ where: { id: draftId, userId } });
    if (!draft) throw new NotFoundException('Draft transaction not found');
    if (draft.status !== DraftStatus.PENDING) throw new BadRequestException('Only pending drafts can be approved');

    const parsed = draft.parsedData as unknown as ParsedDraftTransaction;
    const transaction = await this.transactionsService.create(userId, {
      type: parsed.type,
      description: parsed.description,
      amount: parsed.amount,
      currency: parsed.currency,
      occurredAt: new Date(parsed.occurredAt),
      fromAccountId: parsed.fromAccountId,
      toAccountId: parsed.toAccountId,
      categoryId: parsed.categoryId,
      draftId: draft.id
    });

    const approved = await this.prisma.draftTransaction.update({
      where: { id: draft.id },
      data: { status: DraftStatus.APPROVED, approvedAt: new Date() }
    });

    this.events.emit(DomainEvents.DraftApproved, {
      draftId: draft.id,
      transactionId: transaction.id,
      userId
    } satisfies DraftApprovedEvent);

    return { draft: approved, transaction };
  }

  async reject(userId: string, draftId: string, reason?: string) {
    const draft = await this.prisma.draftTransaction.findFirst({ where: { id: draftId, userId } });
    if (!draft) throw new NotFoundException('Draft transaction not found');
    if (draft.status !== DraftStatus.PENDING) throw new BadRequestException('Only pending drafts can be rejected');

    return this.prisma.draftTransaction.update({
      where: { id: draftId },
      data: { status: DraftStatus.REJECTED, rejectedAt: new Date(), rejectionReason: reason }
    });
  }
}
