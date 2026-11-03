import { render, screen } from '@testing-library/react-native';

import { AccountSwitcher } from '@/components/shell/account-switcher';
import type { Account } from '@/core/types';

const accounts = [
  { id: 'a1', name: 'Everyday', currency: 'USD' },
  { id: 'a2', name: 'Savings', currency: 'EUR' },
] as Account[];

describe('AccountSwitcher', () => {
  it('shows "All accounts" when nothing is chosen', async () => {
    await render(<AccountSwitcher accounts={accounts} onChange={() => {}} />);
    expect(screen.getByText('All accounts')).toBeTruthy();
  });

  it('shows the chosen account', async () => {
    await render(<AccountSwitcher accounts={accounts} value="a2" onChange={() => {}} />);
    expect(screen.getByText('Savings (EUR)')).toBeTruthy();
  });

  it('names the current choice for screen readers', async () => {
    await render(<AccountSwitcher accounts={accounts} value="a1" onChange={() => {}} />);
    expect(screen.getByLabelText('Filter by account: Everyday (USD)')).toBeTruthy();
  });

  // Opening the list needs the trigger's native measurements, which jest does not have;
  // picking an account is checked in the browser (see the phase report).
});
