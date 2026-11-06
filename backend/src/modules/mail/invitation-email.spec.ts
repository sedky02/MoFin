import { invitationEmail } from './invitation-email';

const input = {
  inviter: 'Sam',
  accountName: 'Joint',
  role: 'EDITOR' as const,
  link: 'https://mofin.app/invitations/accept#token=abc',
};

describe('invitationEmail', () => {
  it('says who, which account and the role, with the link in both parts', () => {
    const mail = invitationEmail(input);
    expect(mail.subject).toBe('Sam invited you to Joint');
    expect(mail.text).toContain(input.link);
    expect(mail.html).toContain(`href="${input.link}"`);
    expect(mail.html).toContain('Sam invited you');
    expect(mail.html).toContain('Editor');
  });

  it('escapes what people typed', () => {
    const mail = invitationEmail({
      ...input,
      inviter: '<i>Sam</i>',
      accountName: '<b>Joint</b>',
    });
    expect(mail.html).toContain('&lt;b&gt;Joint&lt;/b&gt;');
    expect(mail.html).toContain('&lt;i&gt;Sam&lt;/i&gt;');
    expect(mail.html).not.toContain('<b>Joint');
  });

  it('needs no image, so the brand shows with images blocked', () => {
    expect(invitationEmail(input).html).not.toContain('<img');
  });
});
