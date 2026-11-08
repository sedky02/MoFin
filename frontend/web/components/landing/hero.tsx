"use client";

import * as React from "react";
import Link from "next/link";
import { Suspense } from "react";
import { motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import { DemoButton } from "./demo-button";
import { DemoNotice } from "./demo-notice";
import { AppFrame } from "./mock/app-frame";
import { MockDashboard } from "./mock/mock-dashboard";
import { HeroSentence, useHeroLoop } from "./hero-sentence";
import { useSignedIn } from "./use-signed-in";
import { ArrowDown, ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { useAppRelease } from "@/hooks/useAppRelease";

const SCROLL_SPRING = { stiffness: 140, damping: 30, mass: 0.6 };

/**
 * Headline and actions are static markup (visible without JavaScript); only the app window below
 * moves.
 */
export function Hero() {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const play = useInView(frameRef, { once: true, amount: 0.25 });
  const signedIn = useSignedIn();
  const { data: release } = useAppRelease();
  const loop = useHeroLoop();

  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start end", "center center"] });
  const scale = useSpring(useTransform(scrollYProgress, [0, 1], [0.86, 1.04]), SCROLL_SPRING);
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 1], [12, 0]), SCROLL_SPRING);
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [32, 0]), SCROLL_SPRING);

  return (
    <section className="relative overflow-x-clip px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
      {release?.android && <AndroidSticker version={release.android.version} />}
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        {release?.android && (
          <a
            href="#get-the-app"
            className="group mb-7 inline-flex min-h-11 items-center gap-2.5 rounded-full border border-border bg-card py-1.5 pr-4 pl-1.5 text-base shadow-surface transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring xl:hidden"
          >
            <span className="rounded-full bg-primary px-2.5 py-1 text-sm font-semibold text-primary-foreground">New</span>
            <span className="font-medium">Get MoFin for Android</span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>
        )}
        <h1 className="isolate text-[2.9rem] leading-[1] font-semibold tracking-[-0.045em] text-balance sm:text-7xl">
          Know where your{" "}
          <span className="relative inline-block">
            <span aria-hidden className="absolute inset-x-[-0.08em] bottom-[0.06em] -z-10 h-[0.34em] -rotate-1 rounded-sm bg-primary" />
            money
          </span>{" "}
          goes.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
          Say what you spent in a sentence, or let Claude or ChatGPT log it. You approve every entry before it counts.
        </p>

        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-base font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.97]"
            >
              Go to your dashboard
            </Link>
          ) : (
            <>
              <DemoButton />
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-6 text-base font-medium transition-colors hover:bg-muted active:scale-[0.97]"
              >
                Create an account
              </Link>
            </>
          )}
        </div>

        <HeroSentence {...loop} />

        {!signedIn && (
          <p className="mt-5 text-sm text-muted-foreground">
            The demo is your own copy, filled with sample data, and it deletes itself after 24 hours.
          </p>
        )}

        <Suspense>
          <DemoNotice />
        </Suspense>
      </div>

      <div className="relative mx-auto mt-12 max-w-6xl [perspective:1800px]">
        <motion.div
          ref={frameRef}
          // With reduced motion the window stays put (CSS overrides the scroll-linked transform).
          className="origin-[50%_0%] motion-reduce:transform-none!"
          style={{ scale, rotateX, y }}
        >
          <AppFrame>
            <MockDashboard play={play} />
          </AppFrame>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * A tilted "sticker" in the hero's right margin on wide screens, pointing to the Android download.
 * Narrower screens get the pill above the headline instead, since the margin isn't there.
 */
function AndroidSticker({ version }: { version: string }) {
  return (
    <a
      href="#get-the-app"
      className="group absolute top-24 right-[max(1.5rem,calc(50%-37rem))] z-10 hidden w-56 rotate-[5deg] transition-transform duration-300 ease-out hover:rotate-[2deg] focus-visible:outline-none xl:block motion-reduce:transition-none"
    >
      <span aria-hidden className="absolute -top-6 -right-8 size-28 rounded-full bg-primary/35 blur-2xl" />
      <span className="relative block rounded-[1.75rem] bg-[#11120D] p-4 text-[#F4F4EF] shadow-hero ring-1 ring-black/5 group-focus-visible:ring-3 group-focus-visible:ring-ring">
        <span className="flex items-center gap-3">
          <span aria-hidden className="flex h-14 w-9 shrink-0 flex-col items-center rounded-lg border-2 border-[#F4F4EF]/80 pt-1">
            <span className="h-0.5 w-3 rounded-full bg-[#F4F4EF]/60" />
            <LogoMark className="mt-2 size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-[#D7F205]">New · v{version}</span>
            <span className="mt-0.5 block text-base leading-tight font-semibold">MoFin is on Android</span>
          </span>
        </span>
        <span className="mt-4 flex items-center justify-between rounded-full bg-[#D7F205] px-4 py-2 text-sm font-semibold text-[#11120D]">
          Download the app
          <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" aria-hidden />
        </span>
      </span>
    </a>
  );
}
