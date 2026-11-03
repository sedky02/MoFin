import { dismissToast, getToasts, MAX_VISIBLE_TOASTS, resetToasts, subscribeToasts, toast, DEFAULT_TOAST_DURATION_MS } from '@/lib/toast';

jest.mock('@/lib/haptics', () => ({ haptics: { success: jest.fn(), error: jest.fn() } }));
// eslint-disable-next-line import/first
import { haptics } from '@/lib/haptics';

beforeEach(() => {
  resetToasts();
  jest.clearAllMocks();
});

describe('toast store', () => {
  it('adds toasts with the default duration and a success/error haptic', () => {
    toast.success('Saved');
    toast.error('Nope');
    expect(getToasts().map((t) => [t.kind, t.message, t.duration])).toEqual([
      ['success', 'Saved', DEFAULT_TOAST_DURATION_MS],
      ['error', 'Nope', DEFAULT_TOAST_DURATION_MS],
    ]);
    expect(haptics.success).toHaveBeenCalledTimes(1);
    expect(haptics.error).toHaveBeenCalledTimes(1);
  });

  it('a repeated id replaces the toast in place instead of stacking', () => {
    toast.error('Too many requests', { id: 'x' });
    toast.error('Too many requests', { id: 'x' });
    expect(getToasts()).toHaveLength(1);
  });

  it('keeps only the newest toasts', () => {
    for (let i = 0; i < MAX_VISIBLE_TOASTS + 2; i++) toast.success(`m${i}`);
    const msgs = getToasts().map((t) => t.message);
    expect(msgs).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(msgs[msgs.length - 1]).toBe(`m${MAX_VISIBLE_TOASTS + 1}`);
  });

  it('dismisses one or all, and notifies subscribers until they unsubscribe', () => {
    const listener = jest.fn();
    const off = subscribeToasts(listener);
    const a = toast.success('a');
    toast.success('b');
    dismissToast(a);
    expect(getToasts().map((t) => t.message)).toEqual(['b']);
    toast.dismiss();
    expect(getToasts()).toEqual([]);
    const calls = listener.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(4);
    off();
    toast.success('c');
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
