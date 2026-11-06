"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { goalKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Goal, GoalHistoryInstance, GoalRecurrenceUnit, GoalType, Paginated } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

export type GoalListStatus = "active" | "archived" | "all";

// No infinite scroll: 100 (the backend's max page) is effectively everything while the endpoint
// stays bounded.
const GOALS_PAGE_SIZE = 100;

export function useGoals(status: GoalListStatus = "active", enabled = true) {
  return useQuery({
    queryKey: goalKeys.list(status),
    queryFn: async () => {
      const result = await api.get<Paginated<Goal>>("/goals", {
        status,
        limit: GOALS_PAGE_SIZE,
        offset: 0,
      });
      return result.data;
    },
    staleTime: STALE.goals,
    enabled,
  });
}

export function useGoalHistory(goalId: string, enabled = true) {
  return useQuery({
    queryKey: goalKeys.history(goalId),
    queryFn: async () => {
      const result = await api.get<Paginated<GoalHistoryInstance>>(`/goals/${goalId}/history`, {
        limit: GOALS_PAGE_SIZE,
        offset: 0,
      });
      return result.data;
    },
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
      handleApiError(err, { fallback: "Could not cancel goal." });
    },
    onSuccess: () => toast.success("Goal cancelled."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: goalKeys.all }),
  });
}

export function useRestoreGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Goal>(`/goals/${id}/restore`),
    onError: (err) => handleApiError(err, { fallback: "Could not restore goal." }),
    onSuccess: () => toast.success("Goal restored. It tracks again from today."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: goalKeys.all }),
  });
}
