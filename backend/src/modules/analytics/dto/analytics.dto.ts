import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class MonthlySummaryQueryDto {
  @IsInt()
  @Min(2000)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsOptional()
  refresh?: boolean;
}
