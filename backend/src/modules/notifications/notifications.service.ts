import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvents, DraftCreatedEvent } from '../../common/events/domain-events';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  @OnEvent(DomainEvents.DraftCreated)
  notifyDraftPending(event: DraftCreatedEvent) {
    this.logger.log(`Draft ${event.draftId} pending approval for user ${event.userId}`);
  }

  notifyBudgetAlert(userId: string, message: string) {
    this.logger.log(`Budget alert for ${userId}: ${message}`);
  }
}
