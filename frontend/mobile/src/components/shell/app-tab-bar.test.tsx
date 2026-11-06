import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppTabBar } from '@/components/shell/app-tab-bar';
import { VOICE_TIP_KEY } from '@/components/shell/voice-tip';
import { resetStoredFlagCache } from '@/hooks/useStoredFlag';
import { haptics } from '@/lib/haptics';
import { voiceOverlay } from '@/lib/voice-overlay';

let mockSetup: { status: string } = { status: 'off' };
jest.mock('@/hooks/useSetup', () => ({ useSetup: () => mockSetup }));
jest.mock('@/hooks/useUser', () => ({ useUser: () => ({ data: { id: 'u1', isDemo: false } }) }));
jest.mock('@/lib/haptics', () => ({ haptics: { tap: jest.fn(), hold: jest.fn() } }));

const routes = ['dashboard', 'transactions', 'add', 'drafts', 'more'].map((name) => ({ key: `${name}-key`, name }));

function props(badge?: number) {
  const emitter = { emit: jest.fn(() => ({ defaultPrevented: false })) };
  const descriptors = Object.fromEntries(
    routes.map((r) => [
      r.key,
      {
        options:
          r.name === 'add'
            ? { title: 'Add', tabBarAccessibilityLabel: 'New transaction' }
            : {
                title: r.name,
                tabBarBadge: r.name === 'drafts' ? badge : undefined,
                tabBarIcon: () => <Text>{`${r.name}-icon`}</Text>,
              },
      },
    ]),
  );
  return {
    state: { index: 0, routes },
    descriptors,
    emitter,
    navigateToTab: jest.fn(),
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as never as Parameters<typeof AppTabBar>[0] & { emitter: typeof emitter };
}

describe('AppTabBar: the Add button', () => {
  let opened: jest.SpyInstance;
  beforeEach(async () => {
    resetStoredFlagCache();
    await AsyncStorage.clear();
    mockSetup = { status: 'off' };
    opened = jest.spyOn(voiceOverlay, 'open');
    jest.clearAllMocks();
  });
  afterEach(() => opened.mockRestore());

  it('a tap still opens the add form (the tab press), not the voice overlay', async () => {
    const p = props();
    await render(<AppTabBar {...p} />);
    await fireEvent.press(screen.getByLabelText('New transaction'));
    expect(p.emitter.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'add-key' }));
    expect(opened).not.toHaveBeenCalled();
  });

  it('a hold opens the voice overlay with haptic feedback', async () => {
    await render(<AppTabBar {...props()} />);
    await fireEvent(screen.getByLabelText('New transaction'), 'longPress');
    expect(opened).toHaveBeenCalledTimes(1);
    expect(haptics.hold).toHaveBeenCalled();
  });

  it('offers the hold as an accessibility action, and says so in the hint', async () => {
    await render(<AppTabBar {...props()} />);
    const add = screen.getByLabelText('New transaction');
    expect(add.props.accessibilityHint).toBe('Hold to add or ask with your voice');
    await fireEvent(add, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('shows the pending count on Drafts', async () => {
    await render(<AppTabBar {...props(3)} />);
    // Hidden from screen readers: the tab's own label reads the count.
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('the "hold for voice" tip', () => {
  beforeEach(async () => {
    resetStoredFlagCache();
    await AsyncStorage.clear();
    mockSetup = { status: 'off' };
  });

  it('shows once after setup and is remembered, so it never comes back', async () => {
    await render(<AppTabBar {...props()} />);
    expect(await screen.findByText('Hold to add or ask with your voice')).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem(VOICE_TIP_KEY)).toBe('1'));

    // Next launch: the flag is stored, so no tip.
    resetStoredFlagCache();
    await render(<AppTabBar {...props()} />);
    await act(async () => {});
    expect(screen.queryByText('Hold to add or ask with your voice')).toBeNull();
  });

  it('waits while the first-run setup is still showing', async () => {
    mockSetup = { status: 'step' };
    await render(<AppTabBar {...props()} />);
    await act(async () => {});
    expect(screen.queryByText('Hold to add or ask with your voice')).toBeNull();
  });

  it('goes away once Add has been held', async () => {
    await render(<AppTabBar {...props()} />);
    await screen.findByText('Hold to add or ask with your voice');
    await fireEvent(screen.getByLabelText('New transaction'), 'longPress');
    expect(screen.queryByText('Hold to add or ask with your voice')).toBeNull();
  });
});
