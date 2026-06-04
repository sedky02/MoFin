import { IsObject, IsOptional, IsString } from 'class-validator';

export class McpToolRequestDto {
  @IsString()
  tool: string;

  @IsOptional()
  @IsObject()
  arguments?: Record<string, unknown>;
}
