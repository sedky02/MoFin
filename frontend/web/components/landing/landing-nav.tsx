"use client";

import Link from "next/link";
import { motion, useScroll } from "motion/react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { DemoButton } from "./demo-button";

/** Floating glass bar; a thin line along its bottom edge shows how far down the page you are. */
export function LandingNav() {
  const { scrollYProgress } = useScroll();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="MoFin home" className="mr-auto">
          <Logo />
        </Link>
        <ThemeToggle />
        <Link
          href="/login"
          className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
        >
          Sign in
        </Link>
        <DemoButton size="nav" />
      </nav>
      <motion.div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-primary"
        style={{ scaleX: scrollYProgress }}
      />
    </header>
  );
}
