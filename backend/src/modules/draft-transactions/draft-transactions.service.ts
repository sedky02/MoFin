import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DraftStatus, DraftTransaction, Prisma } from '@prisma/client';
import { DomainEvents, DraftApprovedEvent, DraftCreatedEvent } from '../../common/events/domain-events';
import { PrismaService } from '../../database/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  CreateDraftTransactionDto,
  DraftListQuery,
  ParsedDraftTransaction,
  parsedDraftTransactionSchema,
} from './dto/draft-transactions.dto';

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
    return this.prisma.paginated.draftTransaction.paginate({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      orderBy: { createdAt: 'desc' },
      limit: query.limit,
      offset: query.offset
    });
  }

  /** Cheap count for the pending-drafts sidebar badge — no row fetch at all. */
  countPending(userId: string) {
    return this.prisma.draftTransaction.count({ where: { userId, status: DraftStatus.PENDING } });
  }

  async approve(userId: string, draftId: string, overrides?: Partial<ParsedDraftTransaction>) {
    const draft = await this.prisma.draftTransaction.findFirst({ where: { id: draftId, userId } });
    if (!draft) throw new NotFoundException('Draft transaction not found');

    if (draft.status !== DraftStatus.PENDING) {
      return this.reconcileAlreadyApproved(draft);
    }

    const merged = { ...(draft.parsedData as unknown as ParsedDraftTransaction), ...overrides };
    const result = parsedDraftTransactionSchema.safeParse(merged);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Approved transaction data is invalid',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const parsed = result.data;

    try {
      const { transaction, approved } = await this.prisma.$transaction(async (db) => {
        // Conditional update: only flips PENDING -> APPROVED. Under concurrent
        // approvals, Postgres row-locking on this UPDATE serializes the two
        // callers — the loser's WHERE no longer matches once the winner
        // commits, so it affects 0 rows here instead of both racing into
        // transactionsService.create and colliding on the unique draftId.
        const { count } = await db.draftTransaction.updateMany({
          where: { id: draft.id, status: DraftStatus.PENDING },
          data: {
            status: DraftStatus.APPROVED,
            approvedAt: new Date(),
            parsedData: parsed as unknown as Prisma.InputJsonValue
          }
        });
        if (count === 0) {
          throw new BadRequestException('Only pending drafts can be approved');
        }

        const transaction = await this.transactionsService.create(
          userId,
          {
            type: parsed.type,
            description: parsed.description,
            amount: parsed.amount,
            currency: parsed.currency,
            occurredAt: new Date(parsed.occurredAt),
            fromAccountId: parsed.fromAccountId,
            toAccountId: parsed.toAccountId,
            categoryId: parsed.categoryId,
            draftId: draft.id
          },
          db
        );
        const approved = await db.draftTransaction.findUniqueOrThrow({ where: { id: draft.id } });
        return { transaction, approved };
      });

      this.events.emit(DomainEvents.DraftApproved, {
        draftId: draft.id,
        transactionId: transaction.id,
        userId
      } satisfies DraftApprovedEvent);

      return { draft: approved, transaction };
    } catch (error) {
      // Defensive fallback for legacy-broken drafts left over from before this
      // fix (a Transaction row committed for this draftId by an old,
      // non-atomic approve() that crashed before advancing the draft's
      // status): if creation still hits the unique draftId constraint, a
      // transaction already exists here — heal the draft's status to match
      // reality instead of leaving it stuck PENDING forever. This whole
      // $transaction (including the updateMany above) has already rolled
      // back at this point, so the draft is untouched and safe to correct.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingTransaction = await this.prisma.transaction.findUnique({ where: { draftId: draft.id } });
        if (existingTransaction) {
          const approved = await this.prisma.draftTransaction.update({
            where: { id: draft.id },
            data: { status: DraftStatus.APPROVED, approvedAt: draft.approvedAt ?? new Date() }
          });
          return { draft: approved, transaction: existingTransaction };
        }
      }
      throw error;
    }
  }

  /**
   * A non-pending draft is only a valid re-approval target when it's already
   * APPROVED and a transaction was actually committed for it — that combination
   * means a prior approve() call succeeded but the caller retried (network
   * blip, double-click), so we return the existing result idempotently rather
   * than erroring on a draft that isn't actually broken.
   */
  private async reconcileAlreadyApproved(draft: DraftTransaction) {
    if (draft.status === DraftStatus.APPROVED) {
      const transaction = await this.prisma.transaction.findUnique({ where: { draftId: draft.id } });
      if (transaction) return { draft, transaction };
    }
    throw new BadRequestException('Only pending drafts can be approved');
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
