import { render, screen } from '@testing-library/react-native';
import type { BottomTabHeaderProps } from 'expo-router/js-tabs';

import { AppHeader } from '@/components/shell/app-header';

jest.mock('@/hooks/useActiveAccount', () => ({
  useActiveAccount: () => ({ account: undefined, accounts: [], setAccountId: jest.fn(), ready: true }),
}));
jest.mock('@/components/shell/account-switcher', () => ({
  AccountSwitcher: () => {
    const { Text: RNText } = jest.requireActual('react-native');
    return <RNText>account switcher</RNText>;
  },
}));

function headerFor(name: string, title: string) {
  return { options: { title }, route: { name, key: name } } as unknown as BottomTabHeaderProps;
}

describe('AppHeader', () => {
  it('shows the account switcher on the dashboard, the one screen it scopes', async () => {
    await render(<AppHeader {...headerFor('dashboard', 'Dashboard')} />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('account switcher')).toBeTruthy();
  });

  it.each([
    ['transactions', 'Transactions'],
    ['goals', 'Goals'],
    ['more', 'More'],
  ])('shows no switcher on %s', async (name, title) => {
    await render(<AppHeader {...headerFor(name, title)} />);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByText('account switcher')).toBeNull();
  });
});
