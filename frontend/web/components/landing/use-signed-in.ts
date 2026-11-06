"use client";

import * as React from "react";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";

const noop = () => () => {};

function readHint(): boolean {
  return document.cookie.split("; ").some((c) => c === `${SIGNED_IN_COOKIE}=1`);
}

/**
 * Whether this browser has a session, from the non-secret hint cookie; false on the server and
 * during hydration so the prerender matches.
 */
export function useSignedIn(): boolean {
  return React.useSyncExternalStore(noop, readHint, () => false);
}
