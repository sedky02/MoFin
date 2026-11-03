import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { ToastHost, toastAnnouncement } from '@/components/toast-host';
import { getToasts, resetToasts, toast } from '@/lib/toast';

beforeEach(() => {
  jest.useFakeTimers();
  resetToasts();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('toast', () => {
  it('replaces a toast that has the same id', async () => {
    toast.error('Failed', { id: 'x' });
    toast.error('Failed again', { id: 'x' });
    expect(getToasts().map((t) => t.message)).toEqual(['Failed again']);
  });

  it('announces, runs the action and dismisses', async () => {
    const onClick = jest.fn();
    await render(<ToastHost />);
    await act(async () => {
      toast.success('Deleted.', { description: 'It is gone.', action: { label: 'Undo', onClick } });
    });
    expect(screen.getByText('Deleted.')).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Deleted.. It is gone.');
    await fireEvent.press(screen.getByText('Undo'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(getToasts()).toHaveLength(0);
  });

  it('dismisses itself after its duration', async () => {
    await render(<ToastHost />);
    await act(async () => {
      toast.success('Saved.', { duration: 1000 });
    });
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    expect(getToasts()).toHaveLength(0);
  });

  it('prefixes errors for screen readers', () => {
    expect(toastAnnouncement({ kind: 'error', message: 'Nope' })).toBe('Error: Nope');
  });
});
