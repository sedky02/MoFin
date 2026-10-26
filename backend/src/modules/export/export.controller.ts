import {
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiZodQuery } from '../../common/swagger/api-zod';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ExportQueryDto, exportQuerySchema } from './dto/export.dto';
import { ExportThrottlerGuard } from './export-throttler.guard';
import { ExportService } from './export.service';

// Protected by the global JWT guard; never @Public().
@ApiTags('export')
@ApiBearerAuth('jwt')
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  @UseGuards(ExportThrottlerGuard)
  @ApiZodQuery(exportQuerySchema)
  @ApiProduces('application/json', 'text/csv')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQueryDto,
  ): Promise<StreamableFile> {
    const file = await this.exportService.export(user.id, query.format);
    return new StreamableFile(Buffer.from(file.body, 'utf8'), {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
