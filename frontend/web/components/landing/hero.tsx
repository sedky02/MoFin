"use client";

import * as React from "react";
import Link from "next/link";
import { Suspense } from "react";
import { motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import { DemoButton } from "./demo-button";
import { DemoNotice } from "./demo-notice";
import { AppFrame } from "./mock/app-frame";
import { MockDashboard } from "./mock/mock-dashboard";
import { useSignedIn } from "./use-signed-in";

/** Smooths the scroll-linked values so the window eases into each new size. */
const SCROLL_SPRING = { stiffness: 140, damping: 30, mass: 0.6 };

/**
 * The headline and the actions are plain, static markup (visible before and
 * without JavaScript); the motion is the app window below, which grows and
 * tips toward you as you scroll to it.
 */
export function Hero() {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const play = useInView(frameRef, { once: true, amount: 0.25 });
  const signedIn = useSignedIn();

  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start end", "center center"] });
  const scale = useSpring(useTransform(scrollYProgress, [0, 1], [0.86, 1.04]), SCROLL_SPRING);
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 1], [12, 0]), SCROLL_SPRING);
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [32, 0]), SCROLL_SPRING);

  return (
    <section className="px-4 pt-12 pb-16 sm:px-6 sm:pt-20">
      {/* One centred column: headline, what it does, then the two ways in. */}
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <h1 className="text-[2.9rem] leading-[1] font-semibold tracking-[-0.045em] text-balance sm:text-7xl">
          Know where your money goes.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
          Tell MoFin what you spent in a sentence, or ask Claude or ChatGPT to log it for you. Nothing is saved until you
          approve it, and every balance is added up from the entries behind it.
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

        {!signedIn && (
          <p className="mt-4 text-sm text-muted-foreground">
            The demo is your own copy, filled with sample data, and it deletes itself after 24 hours.
          </p>
        )}

        <Suspense>
          <DemoNotice />
        </Suspense>
      </div>

      <div className="mx-auto mt-14 max-w-6xl [perspective:1800px]">
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
