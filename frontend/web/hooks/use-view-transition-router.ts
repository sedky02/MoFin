"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type StartViewTransition = (cb: () => void) => unknown;

/**
 * Navigate with a View Transition crossfade when the browser supports it
 * (opt-in per navigation, as used by the sidebar nav). Falls back to a normal
 * push elsewhere. The root crossfade is defined in globals.css.
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
