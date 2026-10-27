import { LandingMotion } from "@/components/landing/landing-motion";

/** Public pages: no app shell, no sign-in needed. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <LandingMotion>
      <div className="min-h-dvh overflow-x-clip bg-background">
        {/* Same skip link as the app shell (components/shell/app-shell.tsx). */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        {children}
      </div>
    </LandingMotion>
  );
}
