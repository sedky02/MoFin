/**
 * The two layouts MoFin emails use (see backend/CLAUDE.md, "Emails"): `minimalEmail` for account
 * and security messages, `accountCardEmail` for an email about one shared account. Built from tables
 * and inline styles because mail clients ignore stylesheets, SVG and most CSS.
 */

/** The logo guidelines' colours, written out: mail clients don't read the app's tokens. */
const LIME = '#D7F205';
const INK = '#11120D';
const PAGE = '#FAFAF9';
const MUTED = '#6F6F68';
const HAIRLINE = '#ECECE8';
const FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The account card from the app's sign-in panel. */
const CARD = '#1A1A17';
const CARD_BORDER = '#2E2E2B';
const CARD_TEXT = '#F4F4EF';
const CARD_MUTED = '#9A9D95';

function bars(
  color: string,
  width: number,
  heights: [number, number, number],
  gap: number,
): string {
  const bar = (height: number) =>
    `<td valign="bottom" style="padding:0;font-size:0;line-height:0;"><div style="width:${width}px;height:${height}px;background:${color};border-radius:${Math.max(2, Math.round(width / 3))}px;font-size:0;line-height:0;">&nbsp;</div></td>`;
  const spacer = `<td width="${gap}" style="font-size:0;line-height:0;">&nbsp;</td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${bar(heights[0])}${spacer}${bar(heights[1])}${spacer}${bar(heights[2])}</tr></table>`;
}

/**
 * The Bar M mark from table cells: Outlook blocks images and Gmail strips SVG. Square corners where
 * border-radius is unsupported.
 */
function logo(
  size: 'large' | 'small',
  align: 'center' | 'left',
  wordmark: string = INK,
): string {
  const large = size === 'large';
  const box = large ? 40 : 32;
  const mark = large
    ? bars(INK, 6, [15, 9, 21], 2)
    : bars(INK, 5, [12, 7, 17], 2);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}"><tr>
    <td width="${box}" height="${box}" valign="bottom" align="center" bgcolor="${LIME}" style="width:${box}px;height:${box}px;background:${LIME};border-radius:${large ? 10 : 8}px;padding:0 0 ${large ? 10 : 8}px;box-sizing:border-box;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>${mark}</td></tr></table>
    </td>
    <td width="${large ? 10 : 8}" style="font-size:0;line-height:0;">&nbsp;</td>
    <td valign="middle" style="font-family:${FONT};font-size:${large ? 26 : 21}px;line-height:${box}px;font-weight:600;letter-spacing:-0.04em;color:${wordmark};">MoFin</td>
  </tr></table>`;
}

function fallbackLink(href: string, align: 'center' | 'left'): string {
  return `<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};text-align:${align};">
    Button not working? Paste this link into your browser:<br>
    <a href="${href}" style="color:${INK};text-decoration:underline;word-break:break-all;">${href}</a>
  </div>`;
}

function signOff(align: 'center' | 'left'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}"><tr>
    <td valign="bottom" style="padding-right:8px;">${bars(MUTED, 3, [7, 4, 10], 2)}</td>
    <td style="font-family:${FONT};font-size:11px;line-height:14px;color:${MUTED};"><span style="font-weight:600;color:${INK};">MoFin</span> &middot; Every balance, exact.</td>
  </tr></table>`;
}

function emailDocument(title: string, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
  <tr><td align="center" style="padding:40px 16px;">
${body}
  </td></tr>
</table>
</body>
</html>`;
}

function limeButton(
  label: string,
  href: string,
  width: 'full' | 'auto',
): string {
  const full = width === 'full';
  return `<table role="presentation" ${full ? 'width="100%"' : ''} cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" bgcolor="${LIME}" style="background:${LIME};border-radius:${full ? 14 : 12}px;">
      <a href="${href}" style="display:block;font-family:${FONT};font-size:${full ? 16 : 15}px;line-height:20px;font-weight:600;color:${INK};text-decoration:none;padding:${full ? '15px 20px' : '13px 24px'};">${label}</a>
    </td>
  </tr></table>`;
}

function arrowButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" bgcolor="${LIME}" style="background:${LIME};border-radius:12px;">
      <a href="${href}" style="display:block;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${INK};text-decoration:none;padding:14px 26px;">${label} &rarr;</a>
    </td>
  </tr></table>`;
}

/**
 * Account and security emails: a dark header like the app's sign-in panel (logo, label, heading and
 * the three lime bars), then a white body with one paragraph, one button and the link's limits.
 * Every argument is inserted as is: escape anything a user typed before passing it, and only pass
 * links the backend built.
 */
export function minimalEmail({
  title,
  preheader,
  eyebrow,
  heading,
  bodyHtml,
  button,
  meta,
  noteHtml,
  footnote,
}: {
  title: string;
  preheader: string;
  /** Small label above the heading, e.g. "Password reset". */
  eyebrow: string;
  heading: string;
  /** One short paragraph; wrap the address in `emailStrong` when it matters. */
  bodyHtml: string;
  button: { label: string; href: string };
  /** What limits the link, e.g. "Expires in 24 hours · works once". */
  meta: string;
  /** Optional line with a secondary link, never a second button. */
  noteHtml?: string;
  footnote: string;
}): string {
  const note = noteHtml
    ? `<tr><td style="padding-top:8px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${noteHtml}</td></tr>`
    : '';
  return emailDocument(
    title,
    preheader,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
      <tr><td bgcolor="${INK}" style="background:${INK};border-radius:24px 24px 0 0;padding:28px 32px 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td colspan="2" style="padding-bottom:44px;">${logo('small', 'left', CARD_TEXT)}</td></tr>
          <tr>
            <td valign="bottom">
              <div style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:600;color:${LIME};">${eyebrow}</div>
              <div style="padding-top:8px;font-family:${FONT};font-size:30px;line-height:34px;font-weight:700;letter-spacing:-0.03em;color:${CARD_TEXT};">${heading}</div>
            </td>
            <td align="right" valign="bottom" width="48" style="padding-left:16px;">${bars(LIME, 10, [24, 14, 34], 4)}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid ${HAIRLINE};border-top:0;border-radius:0 0 24px 24px;padding:30px 32px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:${FONT};font-size:15px;line-height:24px;color:${MUTED};">${bodyHtml}</td></tr>
          <tr><td style="padding-top:24px;">${arrowButton(button.label, button.href)}</td></tr>
          <tr><td style="padding-top:14px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};"><span style="color:#8FA300;">&#9679;</span>&nbsp; ${meta}</td></tr>
          ${note}
          <tr><td style="padding-top:26px;"><div style="border-top:1px solid ${HAIRLINE};font-size:0;line-height:0;">&nbsp;</div></td></tr>
          <tr><td style="padding-top:16px;">${fallbackLink(button.href, 'left')}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${footnote}</td></tr>
      <tr><td style="padding:22px 8px 0;">${signOff('left')}</td></tr>
    </table>`,
  );
}

export interface AccountCard {
  /** Small muted label, top left, e.g. "Shared account". */
  label: string;
  /** Outlined tag, top right, e.g. the role. */
  tag: string;
  /** Already escaped: the account's name, shown large. */
  nameHtml: string;
  /** Already escaped: the line under the name, e.g. who shared it. */
  detailHtml: string;
}

/**
 * An email about one shared account: the account card from the app's sign-in panel inside a white
 * card. Every argument is inserted as is: escape anything a user typed before passing it.
 */
export function accountCardEmail({
  title,
  preheader,
  heading,
  intro,
  card,
  button,
  footnote,
}: {
  title: string;
  preheader: string;
  heading: string;
  /** One sentence under the heading: what the reader can do once they accept. */
  intro: string;
  card: AccountCard;
  button: { label: string; href: string };
  footnote: string;
}): string {
  return emailDocument(
    title,
    preheader,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">
      <tr><td align="center" style="padding-bottom:28px;">${logo('large', 'center')}</td></tr>
      <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid ${HAIRLINE};border-radius:28px;padding:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:18px 12px 6px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.02em;color:${INK};">${heading}</td></tr>
          <tr><td align="center" style="padding:0 16px 22px;font-family:${FONT};font-size:14px;line-height:21px;color:${MUTED};">${intro}</td></tr>
          <tr><td bgcolor="${CARD}" style="background:${CARD};border:1px solid ${CARD_BORDER};border-radius:20px;padding:20px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:${CARD_MUTED};">${card.label}</td>
                <td align="right" valign="middle"><span style="display:inline-block;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;color:${LIME};border:1px solid #3A3C36;border-radius:999px;padding:3px 10px;">${card.tag}</span></td>
              </tr>
              <tr><td colspan="2" style="padding:22px 0 26px;font-family:${FONT};font-size:34px;line-height:38px;font-weight:700;letter-spacing:-0.035em;color:${CARD_TEXT};word-break:break-word;">${card.nameHtml}</td></tr>
              <tr>
                <td valign="bottom" style="font-family:${FONT};font-size:13px;line-height:18px;color:${CARD_MUTED};">${card.detailHtml}</td>
                <td align="right" valign="bottom" width="54">${bars(LIME, 12, [30, 18, 42], 4)}</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding-top:14px;">${limeButton(button.label, button.href, 'full')}</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${footnote}</td></tr>
      <tr><td style="padding:14px 8px 0;">${fallbackLink(button.href, 'center')}</td></tr>
      <tr><td align="center" style="padding:28px 8px 0;">${signOff('center')}</td></tr>
    </table>`,
  );
}

/** A secondary link inside a note: underlined ink text, never a second button. */
export function emailLink(href: string, label: string): string {
  return `<a href="${href}" style="color:${INK};font-weight:600;text-decoration:underline;">${label}</a>`;
}

/** An address or name inside a paragraph, set in ink so it stands out from the muted text. */
export function emailStrong(html: string): string {
  return `<strong style="font-weight:600;color:${INK};">${html}</strong>`;
}
