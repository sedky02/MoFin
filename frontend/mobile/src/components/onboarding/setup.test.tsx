import { fireEvent, render, screen } from '@testing-library/react-native';

import { FirstTransactionPanel } from '@/components/onboarding/first-transaction-panel';
import { Setup } from '@/components/onboarding/setup';
import type { Account } from '@/core/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/components/onboarding/first-account-form', () => {
  const { View } = jest.requireActual('react-native');
  return { FirstAccountForm: () => <View accessibilityLabel="Add your first account" /> };
});

const account = (over: Partial<Account> = {}) => ({ id: 'a1', name: 'Main bank account', currency: 'TND', ...over }) as Account;

describe('Setup', () => {
  it('step 1: greets by first name, shows the account form, offers no skip', async () => {
    await render(<Setup step="account" accounts={[]} skip={() => {}} name="  Alex Demo " />);
    expect(screen.getByText('Add your first account')).toBeTruthy();
    expect(screen.getByText(/^Welcome to MoFin, Alex\./)).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Add your first account')).toBeTruthy();
    expect(screen.queryByText('Skip for now')).toBeNull();
  });

  it('works without a name', async () => {
    await render(<Setup step="account" accounts={[]} skip={() => {}} />);
    expect(screen.getByText(/^Welcome to MoFin\./)).toBeTruthy();
  });

  it('step 2: confirms the account, marks the form slot, and can be skipped', async () => {
    const skip = jest.fn();
    await render(<Setup step="transaction" accounts={[account()]} skip={skip} />);
    expect(screen.getByText('Record your first transaction')).toBeTruthy();
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByText('Main bank account (TND) is ready.')).toBeTruthy();
    expect(screen.getByTestId('setup-transaction-slot')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Skip for now'));
    expect(skip).toHaveBeenCalledTimes(1);
  });

  it('step 2 counts several accounts instead of naming one', async () => {
    await render(<Setup step="transaction" accounts={[account(), account({ id: 'a2' })]} skip={() => {}} />);
    expect(screen.getByText('2 accounts are ready.')).toBeTruthy();
  });
});

describe('FirstTransactionPanel', () => {
  beforeEach(() => mockPush.mockClear());
  it('names the next step and offers its two ways in', async () => {
    await render(<FirstTransactionPanel />);
    expect(screen.getByText('Record your first transaction')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Record a transaction/));
    expect(mockPush).toHaveBeenLastCalledWith('/transactions/new');
    await fireEvent.press(screen.getByLabelText(/^Describe it in words/));
    expect(mockPush).toHaveBeenLastCalledWith('/drafts');
  });
});
