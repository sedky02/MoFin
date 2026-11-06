import type { Account, DraftTransaction } from '@/core/types';

import { buildApproval, confidenceTier, draftAccountSummary, draftDisplayAmount, initialReviewValues, quickApproveState } from './draft-model';

const usd = { id: 'a1', name: 'Cash', currency: 'USD' } as Account;
const tnd = { id: 'a2', name: 'Bank', currency: 'TND' } as Account;
const accounts = [usd, tnd];

function draft(parsed: Partial<DraftTransaction['parsedData']> = {}, confidence = '0.9'): DraftTransaction {
  return {
    id: 'd1',
    rawInput: 'coffee 4.5',
    confidenceScore: confidence,
    source: 'COMPOSER',
    status: 'PENDING',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    parsedData: { type: 'EXPENSE', description: 'Coffee', amount: '4.5', currency: 'USD', fromAccountId: 'a1', ...parsed },
  };
}

describe('quickApproveState', () => {
  it('allows a complete, confident draft', () => {
    expect(quickApproveState(draft()).blocked).toBe(false);
  });
  it('blocks a missing amount, missing account or low confidence, with the web reasons', () => {
    expect(quickApproveState(draft({ amount: '' }))).toEqual({ blocked: true, reason: 'Missing amount or currency' });
    expect(quickApproveState(draft({ fromAccountId: null }))).toEqual({ blocked: true, reason: 'No account chosen' });
    expect(quickApproveState(draft({}, '0.3'))).toEqual({ blocked: true, reason: 'Low AI confidence' });
    expect(quickApproveState(draft({ type: 'TRANSFER', toAccountId: null }))).toMatchObject({ blocked: true });
  });
});

describe('display helpers', () => {
  it('summarises accounts per type', () => {
    expect(draftAccountSummary(draft().parsedData, accounts)).toBe('From Cash');
    expect(draftAccountSummary({ ...draft().parsedData, type: 'INCOME', toAccountId: 'a2' }, accounts)).toBe('Into Bank');
    expect(draftAccountSummary({ ...draft().parsedData, type: 'TRANSFER', toAccountId: 'a2' }, accounts)).toBe('Cash → Bank');
    expect(draftAccountSummary(draft({ fromAccountId: 'gone' }).parsedData, accounts)).toBeNull();
  });
  it('shows an expense as negative', () => {
    expect(draftDisplayAmount(draft().parsedData)).toBe('-4.5');
    expect(draftDisplayAmount(draft({ amount: '-4.5' }).parsedData)).toBe('-4.5');
    expect(draftDisplayAmount(draft({ type: 'INCOME' }).parsedData)).toBe('4.5');
    expect(draftDisplayAmount(draft({ currency: '' }).parsedData)).toBeNull();
  });
  it('tiers the confidence', () => {
    expect(confidenceTier('0.92')).toEqual({ label: '92% sure', tier: 'high' });
    expect(confidenceTier('0.5').tier).toBe('medium');
    expect(confidenceTier('0.2').tier).toBe('low');
    expect(confidenceTier('nope').tier).toBe('none');
  });
});

describe('review precision rules', () => {
  it('rounds the amount to the currency minor units', () => {
    expect(initialReviewValues(draft(), accounts).amountRaw).toBe('4.50');
    expect(initialReviewValues(draft({ amount: '12.5', currency: 'TND', fromAccountId: 'a2' }), accounts).amountRaw).toBe('12.500');
  });

  it('fills empty accounts and follows the source account currency', () => {
    const v = initialReviewValues(draft({ fromAccountId: null, currency: 'TND' }), accounts);
    expect(v.fromAccountId).toBe('a1');
    expect(v.toAccountId).toBe('a2');
    expect(v.currency).toBe('USD');
  });

  it('sends the parsed decimal, ISO date and only the fields the type uses', () => {
    const v = initialReviewValues(draft({ occurredAt: '2026-11-02T09:30:00.000Z', categoryId: 'c1' }), accounts);
    const r = buildApproval({ ...v, amountRaw: '1,234.5' }, accounts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.edits).toMatchObject({ type: 'EXPENSE', description: 'Coffee', amount: '1234.5', currency: 'USD', fromAccountId: 'a1', categoryId: 'c1' });
      expect(r.edits.toAccountId).toBeUndefined();
      expect(new Date(r.edits.occurredAt!).toISOString()).toBe(r.edits.occurredAt);
    }
  });

  it('keeps the web rules: positive amount, account currency, transfers need two matching accounts', () => {
    const v = initialReviewValues(draft(), accounts);
    expect(buildApproval({ ...v, amountRaw: '0' }, accounts)).toMatchObject({ ok: false, errors: { amountRaw: 'Enter an amount greater than 0.' } });
    expect(buildApproval({ ...v, currency: 'EUR' }, accounts)).toMatchObject({ ok: false, errors: { amountRaw: 'Amount must be in USD.' } });
    const t = buildApproval({ ...v, type: 'TRANSFER', toAccountId: 'a2' }, accounts);
    expect(t).toMatchObject({ ok: false, errors: { toAccountId: 'Cross-currency transfers aren\'t supported (USD → TND).' } });
    expect(buildApproval({ ...v, description: ' ' }, accounts)).toMatchObject({ ok: false, errors: { description: 'Add a short description.' } });
  });
});
