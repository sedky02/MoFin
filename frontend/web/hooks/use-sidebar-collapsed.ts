"use client";

import * as React from "react";

const KEY = "mofin:sidebar-collapsed";
const EVENT = "mofin:sidebar-collapsed-change";

// Kept in memory too, so the choice holds for the visit when storage is blocked.
let memory: boolean | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether the desktop sidebar is collapsed to icons, remembered between visits. Expanded on the server. */
export function useSidebarCollapsed(): readonly [boolean, (collapsed: boolean) => void] {
  const collapsed = React.useSyncExternalStore(subscribe, read, () => false);
  const set = (value: boolean) => {
    memory = value;
    try {
      window.localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* storage blocked: the in-memory value still holds for this visit */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [collapsed, set];
}
