import { Linking, Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { UpdateBanner } from '@/components/shell/update-banner';

const mock = { installed: '11' as string | null, dismissed: false };
const mockDismiss = jest.fn();

jest.mock('expo-application', () => ({
  get nativeBuildVersion() {
    return mock.installed;
  },
  nativeApplicationVersion: '1.0.2',
}));
jest.mock('@/hooks/useAppRelease', () => ({
  useAppRelease: () => ({
    data: {
      android: {
        version: '1.0.3',
        build: 12,
        url: 'https://example.com/mofin.apk',
        legacyUrl: null,
        notes: [],
        publishedAt: '2026-11-09T00:00:00Z',
      },
      ios: null,
    },
  }),
}));
jest.mock('@/hooks/useStoredFlag', () => ({ useStoredFlag: () => [mock.dismissed, mockDismiss] }));

const originalOS = Platform.OS;
beforeEach(() => {
  mock.installed = '11';
  mock.dismissed = false;
  mockDismiss.mockReset();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
});
afterAll(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS }));

describe('UpdateBanner', () => {
  it('offers the newer build and opens its download', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<UpdateBanner />);
    expect(screen.getByText('Version 1.0.3 is available.')).toBeTruthy();
    fireEvent.press(screen.getByText('Update'));
    expect(open).toHaveBeenCalledWith('https://example.com/mofin.apk');
  });

  it('hides that build when the user picks Later', async () => {
    await render(<UpdateBanner />);
    fireEvent.press(screen.getByText('Later'));
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('stays quiet when up to date, dismissed, on a development build, or on iOS', async () => {
    mock.installed = '12';
    const upToDate = await render(<UpdateBanner />);
    expect(screen.queryByText(/is available/)).toBeNull();
    upToDate.unmount();

    mock.installed = '11';
    mock.dismissed = true;
    const dismissed = await render(<UpdateBanner />);
    expect(screen.queryByText(/is available/)).toBeNull();
    dismissed.unmount();

    mock.dismissed = false;
    mock.installed = null;
    const dev = await render(<UpdateBanner />);
    expect(screen.queryByText(/is available/)).toBeNull();
    dev.unmount();

    mock.installed = '11';
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    await render(<UpdateBanner />);
    expect(screen.queryByText(/is available/)).toBeNull();
  });
});
