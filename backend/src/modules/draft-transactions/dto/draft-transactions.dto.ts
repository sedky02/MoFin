import { DraftStatus, TransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsObject, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateDraftTransactionDto {
  @IsString()
  rawInput: string;

  @IsObject()
  parsedData: ParsedDraftTransaction;

  @Min(0)
  @Max(1)
  confidenceScore: number;
}

export class ParsedDraftTransaction {
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsString()
  description: string;

  @IsNumberString()
  amount: string;

  @Matches(/^[A-Z0-9]{3,8}$/)
  currency: string;

  @IsDateString()
  occurredAt: string;

  @IsOptional()
  @IsString()
  fromAccountId?: string;

  @IsOptional()
  @IsString()
  toAccountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class RejectDraftDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export interface DraftListQuery {
  status?: DraftStatus;
}
