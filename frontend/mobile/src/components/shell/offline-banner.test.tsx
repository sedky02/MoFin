import { onlineManager } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';

import { OFFLINE_MESSAGE, OfflineBanner } from '@/components/shell/offline-banner';

afterEach(() => onlineManager.setOnline(true));

describe('OfflineBanner', () => {
  it('shows only while offline', async () => {
    await render(<OfflineBanner />);
    expect(screen.queryByText(OFFLINE_MESSAGE)).toBeNull();
    await act(async () => onlineManager.setOnline(false));
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeTruthy();
    await act(async () => onlineManager.setOnline(true));
    expect(screen.queryByText(OFFLINE_MESSAGE)).toBeNull();
  });
});
