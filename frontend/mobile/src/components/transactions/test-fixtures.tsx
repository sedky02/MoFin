// Shared by the list, detail and recurring tests (not a route, not a test file).
import { PortalHost } from '@rn-primitives/portal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { Account, Category, LedgerItem, Transaction } from '@/core/types';

export const ACCOUNT: Account = { id: 'a1', name: 'Everyday', type: 'BANK', currency: 'USD', createdAt: '', updatedAt: '' } as Account;
export const SAVINGS: Account = { id: 'a2', name: 'Savings', type: 'SAVINGS', currency: 'USD', createdAt: '', updatedAt: '' } as Account;
export const FOOD: Category = { id: 'c-food', name: 'Food', type: 'EXPENSE', isSystem: false };

export const page = <T,>(data: T[], extra: { total?: number; offset?: number } = {}) => ({
  data,
  total: extra.total ?? data.length,
  limit: 25,
  offset: extra.offset ?? 0,
});

export function leg(over: Partial<LedgerItem> & Pick<LedgerItem, 'direction'>): LedgerItem {
  return { id: `i-${over.direction}`, transactionId: 't', accountId: 'a1', account: ACCOUNT, amount: '12.50', currency: 'USD', ...over };
}

export function makeTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    type: 'EXPENSE',
    description: 'zz-Coffee',
    currency: 'USD',
    occurredAt: new Date().toISOString(),
    category: FOOD,
    categoryId: FOOD.id,
    items: [leg({ direction: 'DEBIT' })],
    createdAt: '',
    updatedAt: '',
    isRecurring: false,
    ...over,
  };
}

export function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return (
    <QueryClientProvider client={client}>
      {children}
      <PortalHost />
    </QueryClientProvider>
  );
}
