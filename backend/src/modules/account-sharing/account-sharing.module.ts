import { Module } from '@nestjs/common';
import { AccountAccessModule } from '../account-access/account-access.module';
import { MailModule } from '../mail/mail.module';
import {
  AccountSharingController,
  InvitationsController,
} from './account-sharing.controller';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { OwnershipService } from './ownership.service';

@Module({
  imports: [AccountAccessModule, MailModule],
  controllers: [AccountSharingController, InvitationsController],
  providers: [InvitationsService, MembersService, OwnershipService],
})
export class AccountSharingModule {}
