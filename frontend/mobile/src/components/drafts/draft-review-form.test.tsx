import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Account, DraftTransaction } from '@/core/types';

import { DraftReviewForm } from './draft-review-form';

const accounts = [
  { id: 'usd', name: 'Cash', currency: 'USD' },
  { id: 'tnd', name: 'Dinar', currency: 'TND' },
  { id: 'jpy', name: 'Yen', currency: 'JPY' },
] as Account[];

jest.mock('@/components/transactions/datetime-field', () => jest.requireActual('@/components/transactions/datetime-field.test-double'));
jest.mock('@/hooks/useAccounts', () => ({ useAccounts: () => ({ data: accounts }) }));
jest.mock('@/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));

function draft(parsed: Partial<DraftTransaction['parsedData']>): DraftTransaction {
  return {
    id: 'd1',
    rawInput: 'raw text',
    confidenceScore: '0.9',
    status: 'PENDING',
    createdAt: '',
    updatedAt: '',
    parsedData: { type: 'EXPENSE', description: 'Lunch', amount: '1', currency: 'USD', fromAccountId: 'usd', occurredAt: '2026-11-02T09:30:00.000Z', ...parsed },
  };
}

async function open(d: DraftTransaction) {
  const onApprove = jest.fn().mockResolvedValue(undefined);
  await render(
    <>
      <DraftReviewForm draft={d} approving={false} onApprove={onApprove} onCancel={jest.fn()} />
      <PortalHost />
    </>,
  );
  return onApprove;
}

describe('DraftReviewForm amounts', () => {
  it.each([
    ['USD', 'usd', '12.3', '12.30'],
    ['TND', 'tnd', '12.3456', '12.346'],
    ['JPY', 'jpy', '1500', '1500'],
    ['USD', 'usd', '123456789012345.67', '123456789012345.67'],
  ])('pre-fills a %s amount of %s as %s without float drift', async (currency, account, amount, shown) => {
    await open(draft({ currency, fromAccountId: account, amount }));
    expect((await screen.findByLabelText(/^Amount/)).props.value).toBe(shown);
  });

  it('approves the typed amount as an exact decimal string in the account currency', async () => {
    const onApprove = await open(draft({ currency: 'TND', fromAccountId: 'tnd', amount: '5' }));
    await fireEvent.changeText(await screen.findByLabelText(/^Amount/), '1,234.567');
    await fireEvent.press(screen.getByText('Approve & record'));
    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    expect(onApprove.mock.calls[0][0]).toMatchObject({ amount: '1234.567', currency: 'TND', fromAccountId: 'tnd', type: 'EXPENSE' });
  });

  it('refuses a zero or blank amount and does not approve', async () => {
    const onApprove = await open(draft({ amount: '' }));
    await fireEvent.press(await screen.findByText('Approve & record'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('income takes the receiving account and sends no source account', async () => {
    const onApprove = await open(draft({ type: 'INCOME', fromAccountId: null, toAccountId: 'tnd', currency: 'TND', amount: '10' }));
    await fireEvent.press(await screen.findByText('Approve & record'));
    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    const edits = onApprove.mock.calls[0][0];
    expect(edits).toMatchObject({ type: 'INCOME', toAccountId: 'tnd', currency: 'TND', amount: '10' });
    expect(edits.fromAccountId).toBeUndefined();
  });
});
