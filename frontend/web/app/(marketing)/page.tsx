import type { Metadata } from "next";
import Link from "next/link";
import { BookCheck, CircleCheck, Download } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AiOrbit } from "@/components/landing/ai-orbit";
import { DemoButton } from "@/components/landing/demo-button";
import { DraftFlow } from "@/components/landing/draft-flow";
import { GoalsShowcase } from "@/components/landing/goals-showcase";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";
import { Reveal, RevealGroup, RevealItem } from "@/components/landing/reveal";

const DESCRIPTION =
  "MoFin keeps track of your money. Type what you spent or just say it in plain words; you check what it understood before anything is saved, then see where your money went and how close you are to your goals.";

export const metadata: Metadata = {
  // The root template would make this "… · MoFin".
  title: { absolute: "MoFin: know where your money goes" },
  description: DESCRIPTION,
  openGraph: { title: "MoFin: know where your money goes", description: DESCRIPTION, type: "website" },
};

const STEPS = [
  { title: "Say it", text: "Type a sentence, or tell your AI assistant. No forms to fill in." },
  { title: "Check it", text: "MoFin shows what it understood as a draft. Fix anything before it counts." },
  { title: "Done", text: "Approve it and it lands in your ledger, with every balance updated exactly." },
];

const PROMISES = [
  {
    Icon: BookCheck,
    title: "Balances you can trust",
    text: "Every balance is added up from the entries behind it, never typed over. Nothing goes missing.",
  },
  {
    Icon: CircleCheck,
    title: "Nothing saved without you",
    text: "Whatever you or your AI writes is a draft until you approve it.",
  },
  {
    Icon: Download,
    title: "Your data stays yours",
    text: "Export everything as JSON or CSV at any time, or delete your account and all of it.",
  },
];

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main id="main">
        <Hero />

        {/* Say it, check it, done */}
        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div>
              <Reveal>
                <p className="label-sm text-primary-text!">How it works</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
                  Say it. Check it. Done.
                </h2>
              </Reveal>
              <RevealGroup className="mt-8 space-y-5" gap={0.1}>
                {STEPS.map((step, i) => (
                  <RevealItem key={step.title} className="flex gap-4">
                    <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary-text">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{step.title}</h3>
                      <p className="mt-1 text-muted-foreground">{step.text}</p>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
            <DraftFlow />
          </div>
        </section>

        {/* Goals */}
        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <Reveal className="text-center">
              <p className="label-sm text-primary-text!">Goals</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
                See how close you are.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Save toward something, or keep a category under a limit. Progress follows your real spending, month
                by month.
              </p>
            </Reveal>
            <Reveal className="mt-10" delay={0.1}>
              <GoalsShowcase />
            </Reveal>
          </div>
        </section>

        {/* Works with your AI */}
        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <AiOrbit />
            <Reveal>
              <p className="label-sm text-primary-text!">Works with your AI</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
                Ask Claude, ChatGPT or Gemini about your money.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Connect MoFin once, then ask in your own words: &ldquo;How much did I spend on food this
                month?&rdquo; or &ldquo;Add 40 for petrol.&rdquo; Your assistant reads your numbers and suggests
                entries; you still approve every one.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Promises */}
        <section className="px-4 py-24 sm:px-6">
          <RevealGroup className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3" gap={0.1}>
            {PROMISES.map(({ Icon, title, text }) => (
              <RevealItem key={title} className="rounded-card border border-border bg-card p-6 shadow-surface">
                <Icon className="size-5 text-primary-text" aria-hidden />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        {/* Final call to action */}
        <section className="px-4 pt-12 pb-28 sm:px-6">
          <Reveal className="mx-auto max-w-3xl rounded-hero border border-border bg-card px-6 py-14 text-center shadow-hero">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
              Try it with sample data. It takes a few seconds.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Your own demo, no sign-up. When you&apos;re ready, create an account and start with your real numbers.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <DemoButton />
              <Link
                href="/register"
                className="inline-flex h-12 items-center rounded-xl border border-border px-6 text-base font-medium transition-colors hover:bg-muted active:scale-[0.97]"
              >
                Create an account
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Create an account
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
