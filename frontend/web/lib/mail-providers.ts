export interface MailProvider {
  name: string;
  inboxUrl: string;
}

const PROVIDERS: { domains: string[]; provider: MailProvider }[] = [
  { domains: ["gmail.com", "googlemail.com"], provider: { name: "Gmail", inboxUrl: "https://mail.google.com/mail/u/0/#inbox" } },
  {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    provider: { name: "Outlook", inboxUrl: "https://outlook.live.com/mail/0/inbox" },
  },
  { domains: ["yahoo.com", "ymail.com"], provider: { name: "Yahoo Mail", inboxUrl: "https://mail.yahoo.com" } },
  { domains: ["icloud.com", "me.com", "mac.com"], provider: { name: "iCloud Mail", inboxUrl: "https://www.icloud.com/mail" } },
  { domains: ["proton.me", "protonmail.com", "pm.me"], provider: { name: "Proton Mail", inboxUrl: "https://mail.proton.me" } },
];

/** The webmail inbox for a common consumer address, so the user can jump straight to it. */
export function mailProviderFor(email: string): MailProvider | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  return PROVIDERS.find(({ domains }) => domains.includes(domain))?.provider ?? null;
}
