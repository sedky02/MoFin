import { IsOptional, IsString } from 'class-validator';

export class GetBalanceQueryDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export interface LedgerEntryInput {
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  currency: string;
  memo?: string;
}
