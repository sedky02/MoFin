"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { categoryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Category, CategoryType, CategoryUsage, Paginated } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

// No infinite-scroll UI for categories — 100 (the backend's max page size)
// comfortably covers a real user's category list while keeping the endpoint
// itself bounded rather than truly unbounded.
const CATEGORIES_PAGE_SIZE = 100;

type CategoryListStatus = "active" | "archived" | "all";

/**
 * Active categories by default, which is what every picker wants: archived
 * ones are left out by the backend. The categories page asks for "archived"
 * to list them for restoring.
 */
export function useCategories(status: CategoryListStatus = "active", enabled = true) {
  return useQuery({
    queryKey: categoryKeys.list(status),
    queryFn: async () => {
      const result = await api.get<Paginated<Category>>("/categories", {
        status,
        limit: CATEGORIES_PAGE_SIZE,
        offset: 0,
      });
      return result.data;
    },
    staleTime: STALE.categories,
    enabled,
  });
}

/** How many transactions (and budgets) use the category, fetched fresh each time it's asked for. */
export function useCategoryUsage(id: string | undefined) {
  return useQuery({
    queryKey: categoryKeys.usage(id ?? ""),
    queryFn: () => api.get<CategoryUsage>(`/categories/${id}/usage`),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Drops a category from a cached list once the server has confirmed it left. */
function removeFromList(
  queryClient: ReturnType<typeof useQueryClient>,
  status: CategoryListStatus,
  id: string,
) {
  queryClient.setQueryData<Category[]>(categoryKeys.list(status), (old) =>
    old?.filter((c) => c.id !== id),
  );
}

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  color?: string;
  icon?: string;
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post<Category>("/categories", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      toast.success("Category created.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not create category." }),
  });
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  color?: string;
  icon?: string;
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCategoryInput) =>
      api.patch<Category>(`/categories/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      toast.success("Category updated.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not update category." }),
  });
}

// None of these remove the tile optimistically: a delete of a category in use
// is refused, and a tile that vanishes and then comes back with an error toast
// is worse than a short wait. The tile goes once the server has confirmed.
export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/categories/${id}`),
    onSuccess: (_data, id) => {
      removeFromList(queryClient, "active", id);
      removeFromList(queryClient, "archived", id);
      toast.success("Category deleted.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not delete category." }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}

export function useArchiveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Category>(`/categories/${id}/archive`),
    onSuccess: (category) => {
      removeFromList(queryClient, "active", category.id);
      toast.success(`"${category.name}" archived. Restore it any time from Archived.`);
    },
    onError: (err) => handleApiError(err, { fallback: "Could not archive category." }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}

export function useRestoreCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Category>(`/categories/${id}/restore`),
    onSuccess: (category) => {
      removeFromList(queryClient, "archived", category.id);
      toast.success(`"${category.name}" restored.`);
    },
    onError: (err) => handleApiError(err, { fallback: "Could not restore category." }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}
