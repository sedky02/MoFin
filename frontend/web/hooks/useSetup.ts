"use client";

import { useAccounts } from "@/hooks/useAccounts";
import { useConnectedApps } from "@/hooks/useConnectedApps";
import { useRecentTransactions } from "@/hooks/useSearch";
import { useStoredFlag } from "@/hooks/useStoredFlag";
import { useUser } from "@/hooks/useUser";
import { DASHBOARD_RECENT_LIMIT } from "@/lib/dashboard-scope";
import type { Account } from "@/lib/types";
import { currentSetupStep, shouldNudgeAssistant, type SetupStep } from "@/lib/onboarding";

const SKIPPED_KEY = "mofin-setup-skipped";
const NUDGE_CLOSED_KEY = "mofin-assistant-nudge-closed";

export type SetupState =
  /** No setup to show: it is over, or what decides it is still loading (the dashboard has its own). */
  | { status: "off" }
  /** There is an account but not yet whether anything is recorded: wait, so nothing flashes. */
  | { status: "loading" }
  | { status: "step"; step: SetupStep; accounts: Account[]; skip: () => void };

/**
 * Where the first-run setup is: first account, then first transaction (skippable). Counted from the
 * data, so a step done any other way is done.
 */
export function useSetup(): SetupState {
  const [skipped, skip] = useStoredFlag(SKIPPED_KEY);
  const { data: user } = useUser();
  const { data: accounts } = useAccounts();
  const needTransactions = !!accounts?.length && !skipped && !user?.isDemo;
  // The dashboard's own recent list in its All-accounts view, so that request is shared.
  const { data: transactions } = useRecentTransactions(DASHBOARD_RECENT_LIMIT, undefined, needTransactions);

  if (!accounts || user?.isDemo) return { status: "off" };
  if (needTransactions && !transactions) return { status: "loading" };
  const step = currentSetupStep({
    accounts: accounts.length,
    transactions: transactions?.length ?? 0,
    skippedTransaction: skipped,
  });
  return step ? { status: "step", step, accounts, skip } : { status: "off" };
}

/**
 * Whether to suggest connecting an AI assistant once setup is over, with a way to close it for
 * good; the server is asked for connected apps only when it could show.
 */
export function useAssistantNudge(setupOver: boolean): { show: boolean; close: () => void } {
  const [closed, close] = useStoredFlag(NUDGE_CLOSED_KEY);
  const { data: user } = useUser();
  const eligible = setupOver && !closed && !!user && !user.isDemo;
  const { data: apps } = useConnectedApps(eligible);
  const show =
    eligible &&
    !!apps &&
    shouldNudgeAssistant({
      setupStep: null,
      connectedApps: apps.length,
      dismissed: closed,
      isDemo: user.isDemo,
      createdAt: user.createdAt,
    });
  return { show, close };
}
