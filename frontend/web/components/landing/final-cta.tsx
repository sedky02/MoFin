"use client";

import Link from "next/link";
import { DemoButton } from "./demo-button";
import { useSignedIn } from "./use-signed-in";

/**
 * The closing invitation, set on the brand's own colour as one full-width
 * band: the page's single loud moment, after the demos have done the
 * explaining.
 */
export function FinalCta() {
  const signedIn = useSignedIn();
  return (
    <section aria-labelledby="final-cta-title" className="bg-primary text-primary-foreground">
      {/* Centred, with the actions right under the text, so the band reads as one block. */}
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-24">
        <h2
          id="final-cta-title"
          className="text-4xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl"
        >
          Look around with three months of sample data.
        </h2>
        <p className="mt-5 max-w-xl text-lg text-pretty text-primary-foreground/80">
          The demo is yours alone and deletes itself after 24 hours. When you&apos;re ready, create an account and start
          with your own numbers.
        </p>

        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary-foreground px-6 text-base font-medium whitespace-nowrap text-primary transition-colors outline-none hover:bg-primary-foreground/85 focus-visible:ring-3 focus-visible:ring-primary-foreground/60 active:scale-[0.97]"
            >
              Go to your dashboard
            </Link>
          ) : (
            <>
              <DemoButton onBrand />
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-primary-foreground/30 px-6 text-base font-medium whitespace-nowrap transition-colors outline-none hover:bg-primary-foreground/10 focus-visible:ring-3 focus-visible:ring-primary-foreground/60 active:scale-[0.97]"
              >
                Create an account
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
