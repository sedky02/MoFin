import { LandingMotion } from "@/components/landing/landing-motion";

/** Public pages: no app shell, no sign-in needed. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <LandingMotion>
      <div className="min-h-dvh overflow-x-clip bg-background">{children}</div>
    </LandingMotion>
  );
}
