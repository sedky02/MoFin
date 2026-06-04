import { AccountType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @Matches(/^[A-Z0-9]{3,8}$/)
  currency: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
