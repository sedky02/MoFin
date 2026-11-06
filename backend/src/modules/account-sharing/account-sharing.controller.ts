import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DemoBlocked } from '../../common/decorators/demo.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  InvitationThrottlerGuard,
  InvitationTokenThrottlerGuard,
} from '../../common/guards/auth-throttler.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiZodBody } from '../../common/swagger/api-zod';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  AccountPreferencesDto,
  CreateInvitationDto,
  InvitationTokenDto,
  TransferOwnershipDto,
  UpdateMemberDto,
  accountPreferencesSchema,
  createInvitationSchema,
  invitationTokenSchema,
  transferOwnershipSchema,
  updateMemberSchema,
} from './dto/account-sharing.dto';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { OwnershipService } from './ownership.service';

@ApiTags('accounts')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountSharingController {
  constructor(
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
    private readonly ownership: OwnershipService,
  ) {}

  /** What the caller's delete and reset warnings list. */
  @Get('shared/owned')
  sharedOwned(@CurrentUser() user: AuthenticatedUser) {
    return this.members.sharedAccountsOwnedBy(user.id);
  }

  @Get(':id/members')
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.members.list(user.id, id);
  }

  // Before ':userId', or "me" would be read as a user id.
  @DemoBlocked()
  @Delete(':id/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.members.leave(user.id, id);
  }

  @DemoBlocked()
  @Patch(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(updateMemberSchema)
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') memberId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) dto: UpdateMemberDto,
  ) {
    return this.members.changeRole(user.id, id, memberId, dto.role);
  }

  @DemoBlocked()
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') memberId: string,
  ) {
    return this.members.remove(user.id, id, memberId);
  }

  @Patch(':id/preferences')
  @ApiZodBody(accountPreferencesSchema)
  preferences(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accountPreferencesSchema))
    dto: AccountPreferencesDto,
  ) {
    return this.members.setHideAmount(user.id, id, dto.hideAmount);
  }

  @DemoBlocked()
  @Post(':id/transfer-ownership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(transferOwnershipSchema)
  transferOwnership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transferOwnershipSchema))
    dto: TransferOwnershipDto,
  ) {
    return this.ownership.transfer(user.id, id, dto.newOwnerId);
  }

  // Limited per user: each one mails an address the sender picks.
  @UseGuards(InvitationThrottlerGuard)
  @DemoBlocked()
  @Post(':id/invitations')
  @ApiZodBody(createInvitationSchema)
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createInvitationSchema))
    dto: CreateInvitationDto,
  ) {
    return this.invitations.create(user, id, dto);
  }

  @Get(':id/invitations')
  listInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.invitations.listPending(user.id, id);
  }

  @DemoBlocked()
  @Delete(':id/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitations.revoke(user.id, id, invitationId);
  }
}

/** The invitee's side. The token travels in the body, never the URL, so it stays out of logs. */
@ApiTags('invitations')
@UseGuards(InvitationTokenThrottlerGuard)
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(invitationTokenSchema)
  preview(
    @Body(new ZodValidationPipe(invitationTokenSchema))
    dto: InvitationTokenDto,
  ) {
    return this.invitations.preview(dto.token);
  }

  @ApiBearerAuth('jwt')
  @DemoBlocked()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(invitationTokenSchema)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(invitationTokenSchema))
    dto: InvitationTokenDto,
  ) {
    return this.invitations.accept(user.id, dto.token);
  }

  @Public()
  @Post('decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodBody(invitationTokenSchema)
  decline(
    @Body(new ZodValidationPipe(invitationTokenSchema))
    dto: InvitationTokenDto,
  ) {
    return this.invitations.decline(dto.token);
  }
}
