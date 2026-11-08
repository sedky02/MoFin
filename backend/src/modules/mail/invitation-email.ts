import { AccountMemberRole } from '@prisma/client';
import { escapeHtml } from '../../common/utils/escape-html';
import { accountCardEmail } from './email-layout';
import { MailMessage } from './mail-sender';

const ROLE_LABEL: Record<AccountMemberRole, string> = {
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

const ROLE_INTRO: Record<AccountMemberRole, string> = {
  EDITOR: 'You can view and add transactions to this account.',
  VIEWER: 'You can view this account’s balance and transactions.',
};

/** Names are typed by users so they are escaped; `link` is built by us. */
export function invitationEmail({
  inviter,
  accountName,
  role,
  link,
}: {
  inviter: string;
  accountName: string;
  role: AccountMemberRole;
  link: string;
}): Omit<MailMessage, 'to'> {
  const who = escapeHtml(inviter);
  const account = escapeHtml(accountName);
  const roleLabel = ROLE_LABEL[role];

  return {
    subject: `${inviter} invited you to ${accountName}`,
    text: [
      `${inviter} invited you to ${accountName} on MoFin, as ${roleLabel.toLowerCase()}.`,
      '',
      link,
      '',
      'Expires in 7 days.',
    ].join('\n'),
    html: accountCardEmail({
      title: `${who} invited you to ${account}`,
      preheader: `Join ${account} on MoFin.`,
      heading: `${who} invited you`,
      intro: ROLE_INTRO[role],
      card: {
        label: 'Shared account',
        tag: roleLabel,
        nameHtml: account,
        detailHtml: `Shared by ${who}`,
      },
      button: { label: 'Open invitation', href: link },
      footnote: 'The invitation expires in 7 days.',
    }),
  };
}
