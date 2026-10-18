import type { Metadata } from "next";

// The reset token travels in the URL fragment, which browsers never put in a
// Referer header; no-referrer is a second guard for this page.
export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
