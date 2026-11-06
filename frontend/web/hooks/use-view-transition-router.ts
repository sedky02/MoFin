"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type StartViewTransition = (cb: () => void) => unknown;

/**
 * Navigates with a View Transition crossfade when supported (opt-in per navigation, as in the
 * sidebar), else a normal push. The root crossfade is in globals.css.
 */
export function useViewTransitionRouter() {
  const router = useRouter();

  // React Compiler handles memoization — no manual useCallback.
  return (href: string) => {
    const doc = document as Document & {
      startViewTransition?: StartViewTransition;
    };
    const navigate = () => router.push(href);
    if (typeof doc.startViewTransition === "function") {
      React.startTransition(() => {
        doc.startViewTransition!(navigate);
      });
    } else {
      navigate();
    }
  };
}
