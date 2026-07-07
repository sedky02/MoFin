"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { goalKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Goal, GoalInstance, GoalRecurrenceUnit, GoalType } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

export type GoalListStatus = "active" | "archived" | "all";

export function useGoals(status: GoalListStatus = "active", enabled = true) {
  return useQuery({
    queryKey: goalKeys.list(status),
    queryFn: () => api.get<Goal[]>("/goals", { status }),
    staleTime: STALE.goals,
    enabled,
  });
}

export function useGoalHistory(goalId: string, enabled = true) {
  return useQuery({
    queryKey: goalKeys.history(goalId),
    queryFn: () => api.get<GoalInstance[]>(`/goals/${goalId}/history`),
    staleTime: STALE.goals,
    enabled,
  });
}

export interface CreateGoalInput {
  accountId: string;
  name: string;
  type: GoalType;
  targetAmount: string;
  isRecurring: boolean;
  recurrenceUnit?: GoalRecurrenceUnit;
  periodStart: string;
  periodEnd?: string;
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => api.post<Goal>("/goals", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
      toast.success("Goal created.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not create goal." }),
  });
}

export interface UpdateGoalInput {
  id: string;
  name?: string;
  targetAmount?: string;
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateGoalInput) => api.patch<Goal>(`/goals/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.all });
      toast.success("Goal updated.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not update goal." }),
  });
}

/** "Stop" a goal — archives it server-side, moving it from Active to Disabled. */
export function useArchiveGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/goals/${id}`),
    // Only the active list needs an optimistic update — the goal isn't in the
    // archived list yet, and that list is refetched (not shown mid-transition).
    onMutate: async (id) => {
      const key = goalKeys.list("active");
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Goal[]>(key);
      queryClient.setQueryData<Goal[]>(key, (old) => old?.filter((g) => g.id !== id));
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(goalKeys.list("active"), ctx.previous);
      handleApiError(err, { fallback: "Could not stop goal." });
    },
    onSuccess: () => toast.success("Goal stopped."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: goalKeys.all }),
  });
}
