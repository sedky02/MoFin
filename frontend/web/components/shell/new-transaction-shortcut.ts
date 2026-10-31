"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useViewTransitionRouter } from "@/hooks/use-view-transition-router";

/** Whether keys typed at this element are text for it, not shortcuts. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "textbox";
}

/** Press N anywhere (not while typing, and not over a dialog) to start a new transaction. */
export function useNewTransactionShortcut() {
  const navigate = useViewTransitionRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "n" || event.repeat || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      if (pathname === "/transactions/new") return;
      event.preventDefault();
      navigate("/transactions/new");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}

/**
 * The shortcut as a component that draws nothing. The hook reads the pathname, which is request data
 * on a dynamic route, so under cacheComponents it has to sit inside a <Suspense> boundary: calling
 * the hook straight in AppShell failed the prerender of /transactions/[id] (CLIENT_HOOK_DYNAMIC).
 */
export function NewTransactionShortcut(): null {
  useNewTransactionShortcut();
  return null;
}
