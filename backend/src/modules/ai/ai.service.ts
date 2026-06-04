import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { DraftTransactionsService } from '../draft-transactions/draft-transactions.service';
import { ParseTransactionIntentDto } from './dto/ai.dto';

@Injectable()
export class AiService {
  constructor(private readonly draftsService: DraftTransactionsService) {}

  async createDraftFromNaturalLanguage(userId: string, dto: ParseTransactionIntentDto) {
    const parsed = this.stubParse(dto);
    return this.draftsService.create(userId, {
      rawInput: dto.input,
      parsedData: parsed,
      confidenceScore: parsed.amount === '0' ? 0.25 : 0.72
    });
  }

  private stubParse(dto: ParseTransactionIntentDto) {
    const amount = dto.input.match(/(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') ?? '0';
    const currency = (dto.input.match(/\b(TND|USD|EUR|GBP|JPY|CAD|AUD|BTC|ETH)\b/i)?.[1] ?? dto.defaultCurrency ?? 'TND').toUpperCase();
    const lower = dto.input.toLowerCase();
    const type = lower.includes('received') || lower.includes('income') || lower.includes('salary')
      ? TransactionType.INCOME
      : TransactionType.EXPENSE;

    return {
      type,
      description: dto.input,
      amount,
      currency,
      occurredAt: new Date().toISOString(),
      fromAccountId: type === TransactionType.EXPENSE ? dto.defaultAccountId : undefined,
      toAccountId: type === TransactionType.INCOME ? dto.defaultAccountId : undefined
    };
  }
}
