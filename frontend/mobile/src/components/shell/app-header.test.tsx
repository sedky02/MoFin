import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabHeaderProps } from 'expo-router/js-tabs';

import { AppHeader } from '@/components/shell/app-header';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/hooks/useActiveAccount', () => ({
  useActiveAccount: () => ({ account: undefined, accounts: [], setAccountId: jest.fn(), ready: true }),
}));
jest.mock('@/hooks/use-theme-preference', () => ({ setThemePreference: jest.fn() }));
jest.mock('@/components/shell/account-switcher', () => ({
  AccountSwitcher: () => {
    const { Text: RNText } = jest.requireActual('react-native');
    return <RNText>account switcher</RNText>;
  },
}));

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
const { setThemePreference } = jest.requireMock('@/hooks/use-theme-preference') as { setThemePreference: jest.Mock };

function headerFor(name: string, title: string) {
  return { options: { title }, route: { name, key: name } } as unknown as BottomTabHeaderProps;
}

describe('AppHeader', () => {
  it('names the screen for screen readers without printing the title, and shows the switcher on the dashboard', async () => {
    await render(<AppHeader {...headerFor('dashboard', 'Dashboard')} />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.queryByText('Dashboard')).toBeNull();
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

  it('switches the theme and opens Settings from any tab', async () => {
    await render(<AppHeader {...headerFor('goals', 'Goals')} />);
    await fireEvent.press(screen.getByLabelText(/^Switch to (dark|light) mode$/));
    expect(setThemePreference).toHaveBeenCalledWith(expect.stringMatching(/^(dark|light)$/));
    await fireEvent.press(screen.getByLabelText('Settings'));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});
