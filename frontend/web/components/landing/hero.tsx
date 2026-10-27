"use client";

import * as React from "react";
import Link from "next/link";
import { Suspense } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { DemoButton } from "./demo-button";
import { DemoNotice } from "./demo-notice";
import { MockDashboard } from "./mock/mock-dashboard";
import { DeviceFrame } from "./mock/device-frame";
import { fadeUp, SPRING_SLOW, stagger, TILT_SPRING } from "./motion";

const MAX_TILT = 5; // degrees

export function Hero() {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [play, setPlay] = React.useState(false);

  // Scrolling past the hero: the window settles back a little and dims.
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start 80%", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1, 0.94]);
  const opacity = useTransform(scrollYProgress, [0.6, 1], [1, 0.5]);

  // A slight tilt toward a precise pointer; springs back to flat when it leaves.
  const tiltX = useSpring(useMotionValue(0), TILT_SPRING);
  const tiltY = useSpring(useMotionValue(0), TILT_SPRING);
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduceMotion || e.pointerType !== "mouse") return;
    const box = e.currentTarget.getBoundingClientRect();
    tiltY.set(((e.clientX - box.left) / box.width - 0.5) * 2 * MAX_TILT);
    tiltX.set(-((e.clientY - box.top) / box.height - 0.5) * 2 * MAX_TILT);
  }
  function onPointerLeave() {
    tiltX.set(0);
    tiltY.set(0);
  }

  return (
    <section className="relative overflow-x-clip px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
      {/* Soft lime light behind the window. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-40 -z-10 mx-auto h-[28rem] max-w-4xl rounded-full bg-primary/15 blur-3xl"
      />

      <motion.div
        className="mx-auto flex max-w-3xl flex-col items-center text-center"
        variants={stagger(0.09)}
        initial="hidden"
        animate="show"
      >
        <motion.p variants={fadeUp} className="label-sm text-primary-text!">
          Personal finance you can talk to
        </motion.p>
        <motion.h1
          variants={fadeUp}
          className="mt-4 text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-6xl"
        >
          Know where your money goes.
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
          Type what you spent, or just say it. MoFin writes it down, you check it, and every balance stays exact.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <DemoButton />
          <Link
            href="/register"
            className="inline-flex h-12 items-center rounded-xl border border-border px-6 text-base font-medium transition-colors hover:bg-muted active:scale-[0.97]"
          >
            Create an account
          </Link>
        </motion.div>
        <motion.p variants={fadeUp} className="mt-4 text-xs text-muted-foreground">
          No sign-up for the demo. It&apos;s yours alone, filled with sample data, and deletes itself after 24 hours.
        </motion.p>
        <Suspense>
          <DemoNotice />
        </Suspense>
      </motion.div>

      <div className="mx-auto mt-14 max-w-5xl [perspective:1600px]" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        <motion.div
          ref={frameRef}
          style={{ scale, opacity, rotateX: tiltX, rotateY: tiltY }}
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_SLOW, delay: 0.35 }}
          onAnimationComplete={() => setPlay(true)}
        >
          <DeviceFrame>
            <MockDashboard play={play} />
          </DeviceFrame>
        </motion.div>
      </div>
    </section>
  );
}
