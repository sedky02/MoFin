import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiClientError } from "@/api/client";
import { categoryKeys } from "@/core/query-keys";
import { STALE } from "@/lib/query-client";
import type { Category, CategoryType, Paginated } from "@/core/types";
import { toast } from "@/lib/toast";
import { handleApiError } from "@/core/form-errors";

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
    // A name that's taken (409) is shown on the Name field by the dialog, not as a toast.
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 409) return;
      handleApiError(err, { fallback: "Could not create category." });
    },
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
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 409) return;
      handleApiError(err, { fallback: "Could not update category." });
    },
  });
}

// Neither removes the tile optimistically: it goes once the server has confirmed. Categories are
// never deleted from the app: archiving hides one from the pickers and keeps it on past
// transactions, and it can always be restored.
export function useArchiveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Category>(`/categories/${id}/archive`),
    onSuccess: (category) => {
      removeFromList(queryClient, "active", category.id);
      toast.success(`"${category.name}" archived.`, {
        description: "It is hidden from pickers but stays on past transactions.",
        action: {
          label: "Undo",
          onClick: () => {
            api
              .patch<Category>(`/categories/${category.id}/restore`)
              .then(() => toast.success(`"${category.name}" restored.`))
              .catch((err) => handleApiError(err, { fallback: "Could not restore category." }))
              .finally(() => queryClient.invalidateQueries({ queryKey: categoryKeys.all }));
          },
        },
      });
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
