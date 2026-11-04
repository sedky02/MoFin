import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabHeaderProps } from 'expo-router/js-tabs';

import { AppHeader } from '@/components/shell/app-header';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/hooks/use-theme-preference', () => ({ setThemePreference: jest.fn() }));

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
const { setThemePreference } = jest.requireMock('@/hooks/use-theme-preference') as { setThemePreference: jest.Mock };

function headerFor(name: string, title: string) {
  return { options: { title }, route: { name, key: name } } as unknown as BottomTabHeaderProps;
}

describe('AppHeader', () => {
  it.each([
    ['dashboard', 'Dashboard'],
    ['transactions', 'Transactions'],
    ['drafts', 'AI drafts'],
    ['more', 'More'],
  ])('names %s for screen readers without printing the title', async (name, title) => {
    await render(<AppHeader {...headerFor(name, title)} />);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByText(title)).toBeNull();
  });

  it('switches the theme and opens Settings from any tab', async () => {
    await render(<AppHeader {...headerFor('drafts', 'AI drafts')} />);
    await fireEvent.press(screen.getByLabelText(/^Switch to (dark|light) mode$/));
    expect(setThemePreference).toHaveBeenCalledWith(expect.stringMatching(/^(dark|light)$/));
    await fireEvent.press(screen.getByLabelText('Settings'));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});
