import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AiChat } from "@/components/landing/ai-chat";
import { HowItWorks } from "@/components/landing/draft-flow";
import { FinalCta } from "@/components/landing/final-cta";
import { GetTheApp } from "@/components/landing/get-the-app";
import { GoalsShowcase } from "@/components/landing/goals-showcase";
import { Hero } from "@/components/landing/hero";
import { LandingNav } from "@/components/landing/landing-nav";

const DESCRIPTION =
  "MoFin keeps track of your money. Type what you spent or just say it in plain words; you check what it understood before anything is saved, then see where your money went and how close you are to your goals.";

export const metadata: Metadata = {
  // The root template would make this "… · MoFin".
  title: { absolute: "MoFin: know where your money goes" },
  description: DESCRIPTION,
  openGraph: { title: "MoFin: know where your money goes", description: DESCRIPTION, type: "website" },
};

const AI_POINTS = [
  'Ask the way you\'d ask a person: "How much did I spend on food this month?"',
  "Answers come from your real balances, goals and transactions.",
  "Anything it adds waits as a draft until you approve it in MoFin.",
];

const PROMISES = [
  {
    title: "Balances add up",
    text: "Every balance is the sum of the entries behind it. Nothing is typed over, so nothing goes missing.",
  },
  {
    title: "Nothing is saved without you",
    text: "Whatever you or your assistant writes stays a draft until you approve it.",
  },
  {
    title: "Your data stays yours",
    text: "Export everything as JSON or CSV whenever you like, or delete your account and all of it.",
  },
];

const footerLink = "inline-flex min-h-11 items-center hover:text-foreground";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />

        <section className="px-4 py-24 sm:px-6">
          <HowItWorks />
        </section>

        <section aria-labelledby="goals-title" className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <h2 id="goals-title" className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
                See how close you are.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Save toward something, or keep a category under a limit. Progress follows your real spending, month by
                month.
              </p>
            </div>
            <div className="mt-10">
              <GoalsShowcase />
            </div>
          </div>
        </section>

        <section aria-labelledby="ai-title" className="px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div className="lg:sticky lg:top-28">
              <h2 id="ai-title" className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
                Just ask Claude or ChatGPT.
              </h2>
              <p className="mt-4 max-w-md text-muted-foreground">
                Connect MoFin once, and your assistant can check your spending, your goals and your balances whenever
                you ask.
              </p>
              <ul className="mt-6 max-w-md list-disc space-y-2 pl-5 text-sm marker:text-primary-text">
                {AI_POINTS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <AiChat />
          </div>
        </section>

        {/* <section aria-labelledby="promises-title" className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 id="promises-title" className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              What you can count on
            </h2>
            <dl className="mt-8 divide-y divide-border border-y border-border">
              {PROMISES.map(({ title, text }) => (
                <div key={title} className="grid gap-1 py-6 sm:grid-cols-[15rem_1fr] sm:gap-8">
                  <dt className="font-semibold">{title}</dt>
                  <dd className="text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section> */}

        <GetTheApp />

        <FinalCta />
      </main>

      {/* Padded inside the same max-w-6xl container as the nav and sections, so its edges line up with them. */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                Track your money by typing or talking. You approve every entry.
              </p>
            </div>
            <nav aria-label="Footer" className="-ml-1 flex gap-5 text-sm text-muted-foreground sm:ml-0">
              <Link href="/login" className={footerLink}>
                Sign in
              </Link>
              <Link href="/register" className={footerLink}>
                Create an account
              </Link>
              <a href="#get-the-app" className={footerLink}>
                Get the app
              </a>
            </nav>
          </div>
          <p className="mt-8 text-xs text-muted-foreground">© 2026 MoFin</p>
        </div>
      </footer>
    </>
  );
}
