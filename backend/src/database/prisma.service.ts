import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { paginationExtension } from './pagination.extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    // Prisma 7 requires a driver adapter for a direct database connection.
    super({ adapter: new PrismaPg(config.getOrThrow<string>('DATABASE_URL')) });
  }

  /** A field initializer, not a getter, so it is computed once per instance. */
  readonly paginated = this.$extends(paginationExtension);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
