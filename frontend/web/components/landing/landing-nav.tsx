"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { DemoButton } from "./demo-button";
import { useSignedIn } from "./use-signed-in";

const navLink =
  "inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3";

/**
 * Sticky over the page (the one place a translucent bar is doing a job).
 * Visitors get "Sign in" and the demo at every width; signed-in visitors get
 * a way back to the app instead.
 */
export function LandingNav() {
  const signedIn = useSignedIn();
  return (
    // The nav really sits over scrolling content, so it keeps its blur. avoid-ai-design-ignore: K3
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4 sm:gap-2 sm:px-6">
        <Link href="/" aria-label="MoFin home" className="mr-auto">
          <Logo />
        </Link>
        <ThemeToggle />
        {signedIn ? (
          <Link href="/dashboard" className={navLink}>
            Open MoFin
          </Link>
        ) : (
          <>
            <Link href="/login" className={navLink}>
              Sign in
            </Link>
            <DemoButton size="nav" />
          </>
        )}
      </nav>
    </header>
  );
}
