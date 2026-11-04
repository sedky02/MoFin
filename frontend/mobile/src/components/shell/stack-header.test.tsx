import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NativeStackHeaderProps } from 'expo-router';

import { StackHeader } from '@/components/shell/stack-header';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };

function props(over: { name: string; title: string; presentation?: 'modal'; canGoBack: boolean; back?: boolean }) {
  const navigation = { goBack: jest.fn(), canGoBack: () => over.canGoBack };
  return {
    navigation,
    route: { key: over.name, name: over.name, params: undefined },
    options: { title: over.title, presentation: over.presentation },
    back: over.back ? { title: undefined, href: undefined } : undefined,
  } as unknown as NativeStackHeaderProps & { navigation: { goBack: jest.Mock } };
}

describe('StackHeader', () => {
  beforeEach(() => router.replace.mockClear());

  it('shows the title with a Back button that goes back', async () => {
    const p = props({ name: 'accounts/index', title: 'Accounts', canGoBack: true, back: true });
    await render(<StackHeader {...p} />);
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(p.navigation.goBack).toHaveBeenCalled();
  });

  it('shows Close on a modal sheet', async () => {
    await render(<StackHeader {...props({ name: 'transactions/new', title: 'New transaction', presentation: 'modal', canGoBack: true, back: true })} />);
    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  it('goes to the usual parent when there is no history', async () => {
    const p = props({ name: 'settings/preferences', title: 'Preferences', canGoBack: false });
    await render(<StackHeader {...p} />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(p.navigation.goBack).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/settings');
  });
});
