import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AccountInvitation,
  AccountMemberRole,
  InvitationStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  AccountAccessChangedEvent,
  DomainEvents,
} from '../../common/events/domain-events';
import { sha256 } from '../../common/utils/hash';
import { PrismaService } from '../../database/prisma.service';
import { AccountAccessService } from '../account-access/account-access.service';
import { invitationEmail } from '../mail/invitation-email';
import { MailSender } from '../mail/mail-sender';
import { CreateInvitationDto } from './dto/account-sharing.dto';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Pending invitations one account can hold; the database counts them, so it outlives restarts. */
export const MAX_PENDING_INVITATIONS = 20;

export const INVALID_INVITATION_MESSAGE =
  'This invitation is invalid or has expired. Ask for a new one.';

/** Names go into mail sent to an address the sender picked, so they stay short. */
const MAX_NAME_IN_MAIL = 60;
const short = (name: string) =>
  name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_IN_MAIL);

const invalid = () => new BadRequestException(INVALID_INVITATION_MESSAGE);

function toResponse(invitation: AccountInvitation) {
  const { id, accountId, email, role, status, expiresAt, createdAt } =
    invitation;
  return { id, accountId, email, role, status, expiresAt, createdAt };
}

/**
 * Accepting needs the invited, verified address, so a forwarded link is useless. Only the token's
 * hash is stored; reinviting replaces it. No User lookup, so owners can't probe for accounts.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccountAccessService,
    private readonly mail: MailSender,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    user: { id: string; email: string },
    accountId: string,
    dto: CreateInvitationDto,
  ) {
    const { account } = await this.access.assertAccess(
      user.id,
      accountId,
      'manage',
      { activeOnly: true },
    );
    if (!this.mail.delivers) {
      throw new ServiceUnavailableException(
        "Email isn't set up, so invitations can't be sent.",
      );
    }
    if (dto.email === user.email) {
      throw new BadRequestException("You can't invite yourself.");
    }
    const alreadyMember = await this.prisma.accountMember.count({
      where: { accountId, user: { email: dto.email } },
    });
    if (alreadyMember) {
      throw new ConflictException('This person is already a member.');
    }
    const now = new Date();
    const otherPending = await this.prisma.accountInvitation.count({
      where: {
        accountId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
        email: { not: dto.email },
      },
    });
    if (otherPending >= MAX_PENDING_INVITATIONS) {
      throw new HttpException(
        'This account has too many pending invitations. Revoke some first.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const token = randomBytes(32).toString('base64url');
    const fields = {
      invitedById: user.id,
      role: dto.role,
      tokenHash: sha256(token),
      status: InvitationStatus.PENDING,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      respondedAt: null,
    };
    const invitation = await this.prisma.accountInvitation.upsert({
      where: { accountId_email: { accountId, email: dto.email } },
      create: { ...fields, accountId, email: dto.email },
      update: fields,
    });

    const inviter = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { displayName: true, email: true },
    });
    try {
      await this.sendInvitation(
        dto.email,
        token,
        short(inviter.displayName || inviter.email),
        short(account.name),
        dto.role,
      );
    } catch (error) {
      // Nobody has the link, so a pending row would only mislead the owner.
      await this.prisma.accountInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.REVOKED },
      });
      this.logger.error(
        `Invitation ${invitation.id} could not be sent: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        "The invitation couldn't be sent. Try again.",
      );
    }
    return toResponse(invitation);
  }

  private async sendInvitation(
    to: string,
    token: string,
    inviter: string,
    accountName: string,
    role: AccountMemberRole,
  ) {
    const webUrl = this.config
      .get<string>('WEB_URL', 'http://localhost:3001')
      .replace(/\/$/, '');
    // In the fragment, so the token stays out of access logs and Referer headers.
    const link = `${webUrl}/invitations/accept#token=${token}`;
    await this.mail.send({
      to,
      ...invitationEmail({ inviter, accountName, role, link }),
    });
  }

  async listPending(userId: string, accountId: string) {
    await this.access.assertAccess(userId, accountId, 'manage');
    const invitations = await this.prisma.accountInvitation.findMany({
      where: {
        accountId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(toResponse);
  }

  async revoke(userId: string, accountId: string, invitationId: string) {
    await this.access.assertAccess(userId, accountId, 'manage');
    const { count } = await this.prisma.accountInvitation.updateMany({
      where: {
        id: invitationId,
        accountId,
        status: InvitationStatus.PENDING,
      },
      data: { status: InvitationStatus.REVOKED, respondedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Invitation not found');
  }

  private async findUsable(token: string) {
    const invitation = await this.prisma.accountInvitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        account: { select: { name: true, currency: true, archivedAt: true } },
        invitedBy: { select: { displayName: true, email: true } },
      },
    });
    if (
      !invitation ||
      invitation.status !== InvitationStatus.PENDING ||
      invitation.expiresAt <= new Date() ||
      invitation.account.archivedAt
    ) {
      throw invalid();
    }
    return invitation;
  }

  async preview(token: string) {
    const { account, invitedBy, email, role, expiresAt } =
      await this.findUsable(token);
    return {
      accountName: account.name,
      currency: account.currency,
      invitedBy: invitedBy.displayName || invitedBy.email,
      email,
      role,
      expiresAt,
    };
  }

  async accept(userId: string, token: string) {
    const invitation = await this.findUsable(token);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (user.email !== invitation.email) {
      throw new ForbiddenException({
        code: 'INVITATION_WRONG_EMAIL',
        message: `This invitation is for ${invitation.email}. Sign in with that address to accept it.`,
      });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address to accept this invitation.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, invitation.id, InvitationStatus.ACCEPTED);
      const account = await tx.account.findUniqueOrThrow({
        where: { id: invitation.accountId },
        select: { userId: true },
      });
      // The address can belong to the owner by now, after a handover.
      if (account.userId === userId) {
        throw new ConflictException('You already own this account.');
      }
      await tx.accountMember.upsert({
        where: {
          accountId_userId: { accountId: invitation.accountId, userId },
        },
        create: {
          accountId: invitation.accountId,
          userId,
          role: invitation.role,
        },
        update: { role: invitation.role },
      });
    });

    this.events.emit(DomainEvents.AccountAccessChanged, {
      userIds: [userId],
    } satisfies AccountAccessChangedEvent);
    return { accountId: invitation.accountId, role: invitation.role };
  }

  /** The token alone is enough: nobody should have to sign up just to say no. */
  async decline(token: string) {
    const invitation = await this.findUsable(token);
    await this.claim(this.prisma, invitation.id, InvitationStatus.DECLINED);
  }

  /** Spends the invitation, atomically: of two concurrent answers, one gets a 400. */
  private async claim(
    db: Prisma.TransactionClient,
    invitationId: string,
    status: InvitationStatus,
  ) {
    const now = new Date();
    const { count } = await db.accountInvitation.updateMany({
      where: {
        id: invitationId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: { status, respondedAt: now },
    });
    if (count !== 1) throw invalid();
  }
}
