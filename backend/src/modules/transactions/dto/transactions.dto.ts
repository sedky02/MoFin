import { TransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class CreateTransactionDto {
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

  @ValidateIf((dto: CreateTransactionDto) => dto.type !== TransactionType.INCOME)
  @IsString()
  fromAccountId?: string;

  @ValidateIf((dto: CreateTransactionDto) => dto.type !== TransactionType.EXPENSE)
  @IsString()
  toAccountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export interface CreateTransactionCommand {
  type: TransactionType;
  description: string;
  amount: string;
  currency: string;
  occurredAt: Date;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
  draftId?: string;
}
