import { z } from 'zod';

export const getBalanceQuerySchema = z.object({
  accountId: z.string().optional(),
  currency: z.string().optional(),
});
export type GetBalanceQueryDto = z.infer<typeof getBalanceQuerySchema>;

export interface LedgerEntryInput {
  accountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  currency: string;
  memo?: string;
}
