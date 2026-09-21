"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { categoryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { Category, CategoryType, Paginated } from "@/lib/types";
import { toast } from "sonner";
import { handleApiError } from "@/lib/form-errors";

// No infinite-scroll UI for categories — 100 (the backend's max page size)
// comfortably covers a real user's category list while keeping the endpoint
// itself bounded rather than truly unbounded.
const CATEGORIES_PAGE_SIZE = 100;

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: async () => {
      const result = await api.get<Paginated<Category>>("/categories", {
        limit: CATEGORIES_PAGE_SIZE,
        offset: 0,
      });
      return result.data;
    },
    staleTime: STALE.categories,
  });
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

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/categories/${id}`),
    // Optimistically drop the category from the cached list; rolled back if the
    // backend rejects the delete (e.g. category is in use).
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: categoryKeys.all });
      const previous = queryClient.getQueryData<Category[]>(categoryKeys.all);
      queryClient.setQueryData<Category[]>(categoryKeys.all, (old) =>
        old?.filter((c) => c.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(categoryKeys.all, ctx.previous);
      handleApiError(err, { fallback: "Could not delete category." });
    },
    onSuccess: () => toast.success("Category deleted."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
}
