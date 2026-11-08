"use client";

import * as React from "react";
import { useInView } from "motion/react";
import { ArrowDown } from "lucide-react";
import { HelpHint } from "@/components/common/help-hint";
import { useAppRelease } from "@/hooks/useAppRelease";
import { APK_INSTALL_HINT } from "@/lib/app-release";
import { MockDashboard } from "./mock/mock-dashboard";

// The brand's fixed ink and lime (as in the emails), so the band reads the same in light and dark mode.
const INK = "#11120D";
const PAPER = "#F4F4EF";
const LIME = "#D7F205";
const RULE = `${PAPER}26`;
const SOFT = `${PAPER}b3`;

const FACTS = [
  ["Two taps to log", "a coffee, or just say what you spent."],
  ["On your home screen", "your balance and goals as widgets."],
  ["Tells you when to update", "no store needed."],
] as const;

const RELEASE_DATE = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** The Android download (and iPhone "coming soon"); hidden until a build has been published. */
export function GetTheApp() {
  const { data } = useAppRelease();
  const android = data?.android;
  if (!android) return null;

  return (
    <section
      id="get-the-app"
      aria-labelledby="get-the-app-title"
      className="scroll-mt-16 overflow-hidden"
      style={{ backgroundColor: INK, color: PAPER }}
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
        <div className="pb-20 sm:pb-24">
          <p className="text-sm font-semibold tabular" style={{ color: LIME }}>
            Android · v{android.version} · {RELEASE_DATE.format(new Date(android.publishedAt))}
          </p>
          <h2
            id="get-the-app-title"
            className="mt-4 text-[2.75rem] leading-[0.98] font-semibold tracking-[-0.045em] sm:text-7xl"
          >
            Your money,{" "}
            <br />
            <span style={{ color: LIME }}>in your pocket.</span>
          </h2>
          <p className="mt-6 max-w-md text-lg text-pretty" style={{ color: SOFT }}>
            The same account and the same numbers as on the web, made for the moment you pay.
          </p>

          <ul className="mt-10 max-w-lg border-t" style={{ borderColor: RULE }}>
            {FACTS.map(([lead, rest]) => (
              <li key={lead} className="border-b py-3.5 text-base" style={{ borderColor: RULE }}>
                <span className="font-semibold">{lead}:</span> <span style={{ color: SOFT }}>{rest}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <a
              href={android.url}
              download
              className="group inline-flex h-14 items-center justify-center gap-3 rounded-2xl px-7 text-lg font-semibold transition-transform outline-none focus-visible:ring-3 focus-visible:ring-[#D7F205]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#11120D] active:scale-[0.97]"
              style={{ backgroundColor: LIME, color: INK }}
            >
              Download for Android
              <ArrowDown className="size-5 transition-transform group-hover:translate-y-0.5" aria-hidden />
            </a>
            <p className="flex items-center gap-1 text-sm" style={{ color: SOFT }}>
              Free APK · iPhone coming later
              <span className="[&_button]:text-current">
                <HelpHint label="How to install">{APK_INSTALL_HINT}</HelpHint>
              </span>
            </p>
          </div>
          {android.legacyUrl && (
            <a
              href={android.legacyUrl}
              download
              className="mt-4 inline-block text-sm underline underline-offset-4"
              style={{ color: SOFT }}
            >
              Older phone? Get the 32-bit version
            </a>
          )}
        </div>

        <PhoneMockup />
      </div>
    </section>
  );
}

/** A tilted phone showing the dashboard miniature, cut off by the band's bottom edge. Decoration only. */
function PhoneMockup() {
  const ref = React.useRef<HTMLDivElement>(null);
  const play = useInView(ref, { once: true, amount: 0.3 });
  return (
    <div ref={ref} aria-hidden className="relative hidden self-end lg:block">
      <span
        className="absolute top-10 left-1/2 size-72 -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: `${LIME}33` }}
      />
      <div
        className="relative mx-auto w-[19rem] translate-y-10 rotate-[-4deg] rounded-t-[2.75rem] p-2.5 pb-0"
        style={{ backgroundColor: "#2E2E2B" }}
      >
        <div className="overflow-hidden rounded-t-[2.25rem] bg-background text-foreground">
          <div className="flex h-8 items-center justify-center">
            <span className="h-5 w-20 rounded-full" style={{ backgroundColor: INK }} />
          </div>
          <div className="pointer-events-none [&>div]:p-3">
            <MockDashboard play={play} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
