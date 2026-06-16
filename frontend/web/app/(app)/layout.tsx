import { AppShell } from "@/components/shell/app-shell";

// All authenticated app routes live here. proxy.ts already redirects logged-out
// users to /login before they reach this layout.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
