import { escapeHtml } from '../../common/utils/escape-html';
import { emailLink, emailStrong, minimalEmail } from './email-layout';
import { MailMessage } from './mail-sender';

type AuthEmail = Omit<MailMessage, 'to'>;

/** Sent at sign-up and on resend. `link` is built by us; the address is escaped. */
export function verificationEmail({
  email,
  link,
}: {
  email: string;
  link: string;
}): AuthEmail {
  return {
    subject: 'Verify your MoFin email',
    text: [
      `Confirm ${email} to finish creating your MoFin account.`,
      '',
      'Open this link within 24 hours (it works once):',
      link,
      '',
      "Didn't sign up for MoFin? Ignore this email and the account won't be activated.",
    ].join('\n'),
    html: minimalEmail({
      title: 'Verify your MoFin email',
      preheader: 'One tap to finish creating your MoFin account.',
      eyebrow: 'New account',
      heading: 'Verify your email',
      bodyHtml: `Confirm ${emailStrong(escapeHtml(email))} to finish creating your MoFin account.`,
      button: { label: 'Verify my email', href: link },
      meta: 'Expires in 24 hours · works once',
      footnote:
        "Didn't sign up for MoFin? Ignore this email and the account won't be activated.",
    }),
  };
}

/** Sent instead of a verification link when someone signs up with an address that has an account. */
export function accountExistsEmail({
  email,
  webUrl,
}: {
  email: string;
  webUrl: string;
}): AuthEmail {
  const signIn = `${webUrl}/login`;
  const reset = `${webUrl}/forgot-password`;
  return {
    subject: 'You already have a MoFin account',
    text: [
      `Someone tried to create a MoFin account with ${email}, but you already have one.`,
      '',
      `Sign in: ${signIn}`,
      `Forgot your password? Reset it: ${reset}`,
      '',
      "If this wasn't you, you can ignore this email. Nothing has changed.",
    ].join('\n'),
    html: minimalEmail({
      title: 'You already have a MoFin account',
      preheader: 'Someone tried to sign up with this email. Sign in instead.',
      eyebrow: 'Sign-up attempt',
      heading: 'You already have an account',
      bodyHtml: `Someone just tried to create a MoFin account with ${emailStrong(escapeHtml(email))}. You don’t need a new one: sign in to the one you have.`,
      button: { label: 'Sign in', href: signIn },
      meta: 'Your account and its data are unchanged.',
      noteHtml: `Forgot your password? ${emailLink(reset, 'Reset it')}`,
      footnote: "If this wasn't you, you can ignore this email.",
    }),
  };
}

export function passwordResetEmail({
  email,
  link,
  minutes,
}: {
  email: string;
  link: string;
  minutes: number;
}): AuthEmail {
  return {
    subject: 'Reset your MoFin password',
    text: [
      `Someone asked to reset the password for the MoFin account ${email}.`,
      '',
      `Open this link within ${minutes} minutes to choose a new password (it works once):`,
      link,
      '',
      "Didn't ask for this? Ignore this email and your password won't change.",
    ].join('\n'),
    html: minimalEmail({
      title: 'Reset your MoFin password',
      preheader: `Choose a new password within ${minutes} minutes.`,
      eyebrow: 'Password reset',
      heading: 'Reset your password',
      bodyHtml: `We got a request to reset the password for ${emailStrong(escapeHtml(email))}. Choose a new one with the button below.`,
      button: { label: 'Choose a new password', href: link },
      meta: `Expires in ${minutes} minutes · works once`,
      footnote:
        "Didn't ask for this? Ignore this email and your password won't change.",
    }),
  };
}
