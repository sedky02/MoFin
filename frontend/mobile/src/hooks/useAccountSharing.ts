import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { api } from "@/api/client";
import { handleApiError } from "@/core/form-errors";
import {
  accountKeys,
  analyticsKeys,
  goalKeys,
  ledgerKeys,
  searchKeys,
  sharingKeys,
  transactionKeys,
} from "@/core/query-keys";
import type {
  AccountInvitation,
  AccountMember,
  AccountMemberRole,
  OwnedSharedAccount,
} from "@/core/types";

/** Who can reach an account decides every figure and list, so all of them start over. */
function invalidateAccess(queryClient: QueryClient) {
  for (const queryKey of [
    sharingKeys.all,
    accountKeys.all,
    ledgerKeys.all,
    analyticsKeys.all,
    goalKeys.all,
    searchKeys.all,
    transactionKeys.all,
  ]) {
    queryClient.invalidateQueries({ queryKey });
  }
}

export function useAccountMembers(accountId: string | undefined) {
  return useQuery({
    queryKey: sharingKeys.members(accountId ?? ""),
    queryFn: () => api.get<AccountMember[]>(`/accounts/${accountId}/members`),
    enabled: !!accountId,
  });
}

/** Pending invitations. Only the owner can read them, so ask for them only then. */
export function useAccountInvitations(accountId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: sharingKeys.invitations(accountId ?? ""),
    queryFn: () => api.get<AccountInvitation[]>(`/accounts/${accountId}/invitations`),
    enabled: !!accountId && enabled,
  });
}

/** The user's accounts other people can reach, for the warnings before deleting their data. */
export function useOwnedSharedAccounts(enabled = true) {
  return useQuery({
    queryKey: sharingKeys.owned(),
    queryFn: () => api.get<OwnedSharedAccount[]>("/accounts/shared/owned"),
    enabled,
  });
}

export function useInviteMember(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: AccountMemberRole }) =>
      api.post<AccountInvitation>(`/accounts/${accountId}/invitations`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharingKeys.invitations(accountId) });
      toast.success("Invitation sent.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not send the invitation." }),
  });
}

export function useRevokeInvitation(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api.delete<void>(`/accounts/${accountId}/invitations/${invitationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharingKeys.invitations(accountId) });
      toast.success("Invitation revoked.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not revoke the invitation." }),
  });
}

export function useChangeMemberRole(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AccountMemberRole }) =>
      api.patch<void>(`/accounts/${accountId}/members/${userId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharingKeys.members(accountId) });
      toast.success("Role changed.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not change the role." }),
  });
}

export function useRemoveMember(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete<void>(`/accounts/${accountId}/members/${userId}`),
    onSuccess: () => {
      invalidateAccess(queryClient);
      toast.success("Member removed.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not remove this member." }),
  });
}

export function useLeaveAccount(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>(`/accounts/${accountId}/members/me`),
    onSuccess: () => {
      invalidateAccess(queryClient);
      toast.success("You left the account.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not leave the account." }),
  });
}

export function useTransferOwnership(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newOwnerId: string) =>
      api.post<void>(`/accounts/${accountId}/transfer-ownership`, { newOwnerId }),
    onSuccess: () => {
      invalidateAccess(queryClient);
      toast.success("Ownership transferred.");
    },
    onError: (err) => handleApiError(err, { fallback: "Could not transfer ownership." }),
  });
}

/** This person's own "hide amounts" eye; other people on the account keep theirs. */
export function useSetHideAmount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, hideAmount }: { accountId: string; hideAmount: boolean }) =>
      api.patch<void>(`/accounts/${accountId}/preferences`, { hideAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
    },
    onError: (err) => handleApiError(err, { fallback: "Could not update the account." }),
  });
}
