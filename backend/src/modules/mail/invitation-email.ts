import { AccountMemberRole } from '@prisma/client';
import { escapeHtml } from '../../common/utils/escape-html';
import { MailMessage } from './mail-sender';

/** The logo guidelines' colours, written out: mail clients don't read the app's tokens. */
const LIME = '#D7F205';
const INK = '#11120D';
const PAGE = '#FAFAF9';
const MUTED = '#6F6F68';
const ON_INK_MUTED = '#A3A39A';
const FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const ROLE_LABEL: Record<AccountMemberRole, string> = {
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

/**
 * The Bar M mark from table cells: Outlook blocks images and Gmail strips SVG. Square corners where
 * border-radius is unsupported.
 */
function logo(): string {
  const bar = (height: number) =>
    `<td valign="bottom" style="padding:0;font-size:0;line-height:0;"><div style="width:6px;height:${height}px;background:${INK};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td>`;
  const gap = '<td width="2" style="font-size:0;line-height:0;">&nbsp;</td>';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td width="40" height="40" valign="bottom" align="center" bgcolor="${LIME}" style="width:40px;height:40px;background:${LIME};border-radius:10px;padding:0 0 10px;box-sizing:border-box;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${bar(15)}${gap}${bar(9)}${gap}${bar(21)}</tr></table>
    </td>
    <td width="10" style="font-size:0;line-height:0;">&nbsp;</td>
    <td valign="middle" style="font-family:${FONT};font-size:26px;line-height:40px;font-weight:600;letter-spacing:-0.04em;color:${INK};">MoFin</td>
  </tr></table>`;
}

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
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${who} invited you to ${account}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Join ${account} on MoFin.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">
      <tr><td align="center" style="padding-bottom:28px;">${logo()}</td></tr>
      <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #ECECE8;border-radius:28px;padding:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:18px 12px 22px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.02em;color:${INK};">${who} invited you</td></tr>
          <tr><td bgcolor="${INK}" style="background:${INK};border-radius:14px;padding:22px 22px 20px;">
            <div style="font-family:${FONT};font-size:12px;line-height:16px;color:${ON_INK_MUTED};">Shared account</div>
            <div style="font-family:${FONT};font-size:24px;line-height:30px;font-weight:600;letter-spacing:-0.02em;color:#FFFFFF;padding:4px 0 14px;word-break:break-word;">${account}</div>
            <span style="display:inline-block;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;color:${INK};background:${LIME};border-radius:999px;padding:4px 10px;">${roleLabel}</span>
          </td></tr>
          <tr><td style="padding-top:14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" bgcolor="${LIME}" style="background:${LIME};border-radius:14px;">
                <a href="${link}" style="display:block;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:${INK};text-decoration:none;padding:15px 20px;">Open invitation</a>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding-top:20px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">Expires in 7 days</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
  };
}
