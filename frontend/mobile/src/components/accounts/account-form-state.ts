// The logic of the account form, kept out of the component so it is tested without rendering.
import { accountFormSchema, openingBalanceValue, type AccountFormValues } from '@/core/account-form';
import { formatMoneyInput } from '@/core/format';
import { tryParse } from '@/core/decimal';
import { suggestAccountName } from '@/core/onboarding';
import type { Account, AccountType } from '@/core/types';

export interface AccountDraft extends AccountFormValues {
  /** True once the user typed a name; until then the name follows the type. */
  nameEdited: boolean;
}

/** What the opening balance field starts with: blank for 0, so the placeholder shows. */
export function openingBalanceDefault(account?: Pick<Account, 'openingBalance' | 'currency'>): string {
  const d = tryParse(account?.openingBalance ?? '0');
  return !d || d.isZero() ? '' : formatMoneyInput(d.toString(), account?.currency);
}

/** A new account starts as a bank account in the device's currency, named after its type. */
export function initialDraft(account: Account | undefined, deviceCurrency: string): AccountDraft {
  if (account) {
    return {
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: openingBalanceDefault(account),
      nameEdited: true,
    };
  }
  return {
    name: suggestAccountName('BANK'),
    type: 'BANK',
    currency: deviceCurrency,
    openingBalance: '',
    nameEdited: false,
  };
}

/** Picking a type renames the account only while the user has not typed a name. */
export function withType(draft: AccountDraft, type: AccountType): AccountDraft {
  return { ...draft, type, name: draft.nameEdited ? draft.name : suggestAccountName(type) };
}

export function withName(draft: AccountDraft, name: string): AccountDraft {
  return { ...draft, name, nameEdited: true };
}

export type AccountDraftResult =
  | { ok: true; values: AccountFormValues; openingBalance: string }
  | { ok: false; errors: Partial<Record<keyof AccountFormValues, string>> };

/** Validates with the web's schema and returns the opening balance rounded to the currency. */
export function validateAccountDraft(draft: AccountDraft): AccountDraftResult {
  const { nameEdited: _edited, ...values } = draft;
  const parsed = accountFormSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Partial<Record<keyof AccountFormValues, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof AccountFormValues;
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, values: parsed.data, openingBalance: openingBalanceValue(parsed.data.openingBalance, parsed.data.currency) };
}
