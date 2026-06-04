import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  displayName?: string;
  googleId?: string;
}
