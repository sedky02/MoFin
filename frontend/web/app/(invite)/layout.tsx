import { Logo } from "@/components/brand/logo";

// An invitation is one short decision, so it gets the page to itself.
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
