import { Module } from '@nestjs/common';
import { ExpiredRowsCron } from './expired-rows.cron';

@Module({ providers: [ExpiredRowsCron] })
export class MaintenanceModule {}
