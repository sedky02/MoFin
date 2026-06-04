import { IsOptional, IsString } from 'class-validator';

export class ParseTransactionIntentDto {
  @IsString()
  input: string;

  @IsOptional()
  @IsString()
  defaultAccountId?: string;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;
}
