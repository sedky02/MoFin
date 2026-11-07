import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountAccessModule } from '../account-access/account-access.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSender } from './push-sender';
import { ExpoPushSender, LogPushSender } from './push-senders';

/** EXPO_PUSH_ENABLED → the real Expo push service; otherwise nothing leaves the process. */
export function createPushSender(config: ConfigService): PushSender {
  return config.get<string>('EXPO_PUSH_ENABLED') === 'true'
    ? new ExpoPushSender(config.get<string>('EXPO_ACCESS_TOKEN') || undefined)
    : new LogPushSender();
}

@Module({
  imports: [AccountAccessModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: PushSender,
      useFactory: createPushSender,
      inject: [ConfigService],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
