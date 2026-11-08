import {
  accountExistsEmail,
  passwordResetEmail,
  verificationEmail,
} from './auth-emails';

const link = 'https://mofin.app/verify-email#token=abc';

describe('auth emails', () => {
  const all = [
    verificationEmail({ email: 'a@b.com', link }),
    accountExistsEmail({ email: 'a@b.com', webUrl: 'https://mofin.app' }),
    passwordResetEmail({ email: 'a@b.com', link, minutes: 30 }),
  ];

  it('put the action link in both the text and the button', () => {
    const [verify, exists, reset] = all;
    expect(verify.text).toContain(link);
    expect(verify.html).toContain(`href="${link}"`);
    expect(reset.text).toContain(link);
    expect(reset.html).toContain(`href="${link}"`);
    expect(exists.html).toContain('href="https://mofin.app/login"');
    expect(exists.html).toContain('href="https://mofin.app/forgot-password"');
  });

  it('say how long the link lasts', () => {
    expect(all[0].html).toContain('Expires in 24 hours');
    expect(all[2].html).toContain('Expires in 30 minutes');
  });

  it('escape the address, which the person typed', () => {
    const mail = verificationEmail({ email: '<b>x</b>@b.com', link });
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;@b.com');
    expect(mail.html).not.toContain('<b>x</b>');
  });

  it('need no image, so the brand shows with images blocked', () => {
    for (const mail of all) expect(mail.html).not.toContain('<img');
  });
});
