"use client";

import * as React from "react";
import { SIGNED_IN_COOKIE } from "@/lib/session-hint";

const noop = () => () => {};

function readHint(): boolean {
  return document.cookie.split("; ").some((c) => c === `${SIGNED_IN_COOKIE}=1`);
}

/**
 * Whether this browser has a MoFin session, from the non-secret hint cookie.
 * False on the server and during hydration, so the prerendered page always
 * matches; it switches right after for signed-in visitors.
 */
export function useSignedIn(): boolean {
  return React.useSyncExternalStore(noop, readHint, () => false);
}
