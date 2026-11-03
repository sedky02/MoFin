import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Account, DraftTransaction } from '@/core/types';

import { DraftCard } from './draft-card';

const accounts = [
  { id: 'a1', name: 'Cash', currency: 'USD' },
  { id: 'a2', name: 'Bank', currency: 'TND' },
] as Account[];

jest.mock('@/hooks/useAccounts', () => ({ useAccounts: () => ({ data: accounts }) }));
jest.mock('@/hooks/useCategories', () => ({ useCategories: () => ({ data: [] }) }));

function draft(over: Partial<DraftTransaction> = {}): DraftTransaction {
  return {
    id: 'd1',
    rawInput: 'coffee 4.5',
    confidenceScore: '0.9',
    status: 'PENDING',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    parsedData: { type: 'EXPENSE', description: 'Coffee', amount: '4.5', currency: 'USD', fromAccountId: 'a1', occurredAt: '2026-11-02T09:30:00.000Z' },
    ...over,
  };
}

describe('DraftCard', () => {
  it('quick-approves with no edits', async () => {
    const onApprove = jest.fn().mockResolvedValue(undefined);
    await render(<DraftCard draft={draft()} onApprove={onApprove} onReject={jest.fn()} />);
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByText('90% sure')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('d1', {});
  });

  it('blocks quick approve when an account is missing and says why', async () => {
    await render(
      <DraftCard draft={draft({ parsedData: { type: 'EXPENSE', description: 'Coffee', amount: '4.5', currency: 'USD' } })} onApprove={jest.fn()} />,
    );
    expect(screen.getByText('No account chosen — review first')).toBeTruthy();
    expect(screen.getByLabelText('Approve').props.accessibilityState?.disabled ?? screen.getByLabelText('Approve').props['aria-disabled']).toBeTruthy();
  });

  it('rejects with a trimmed reason, or none', async () => {
    const onReject = jest.fn();
    await render(<DraftCard draft={draft()} onApprove={jest.fn()} onReject={onReject} />);
    await fireEvent.press(screen.getByLabelText('Reject'));
    await fireEvent.changeText(screen.getByLabelText('Reason (optional)'), '  duplicate  ');
    await fireEvent.press(screen.getByLabelText('Reject draft'));
    expect(onReject).toHaveBeenCalledWith('d1', 'duplicate');
  });

  it('opens the review form pre-filled and approves with the edited fields', async () => {
    const onApprove = jest.fn().mockResolvedValue(undefined);
    await render(<DraftCard draft={draft()} onApprove={onApprove} />);
    await fireEvent.press(screen.getByLabelText('Review & edit'));
    expect(await screen.findByTestId('draft-review-form')).toBeTruthy();
    // 4.5 is shown as 4.50 (the currency's minor units).
    expect(screen.getByLabelText('Amount in USD').props.value).toBe('4.50');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'Flat white');
    await fireEvent.press(screen.getByLabelText('Approve and record'));
    await waitFor(() => expect(onApprove).toHaveBeenCalled());
    expect(onApprove.mock.calls[0][0]).toBe('d1');
    expect(onApprove.mock.calls[0][1]).toMatchObject({ description: 'Flat white', amount: '4.5', currency: 'USD', fromAccountId: 'a1' });
  });

  it('shows validation errors and does not approve an invalid review', async () => {
    const onApprove = jest.fn();
    await render(<DraftCard draft={draft()} onApprove={onApprove} />);
    await fireEvent.press(screen.getByLabelText('Review & edit'));
    await fireEvent.changeText(await screen.findByLabelText('Amount in USD'), '0');
    await fireEvent.press(screen.getByLabelText('Approve and record'));
    expect(await screen.findByText('Enter an amount greater than 0.')).toBeTruthy();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('has no actions on an approved draft and shows a rejected draft\'s reason', async () => {
    await render(<DraftCard draft={draft({ status: 'REJECTED', reason: 'duplicate' })} />);
    expect(screen.queryByLabelText('Approve')).toBeNull();
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Reason: duplicate')).toBeTruthy();
  });

  it('reads the reason the API actually sends (rejectionReason)', async () => {
    const d = { ...draft({ status: 'REJECTED' }), rejectionReason: 'not mine' } as DraftTransaction;
    await render(<DraftCard draft={d} />);
    expect(screen.getByText('Reason: not mine')).toBeTruthy();
  });
});
