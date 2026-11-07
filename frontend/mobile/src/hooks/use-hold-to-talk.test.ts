import { act, renderHook } from '@testing-library/react-native';

import { useHoldToTalk } from '@/hooks/use-hold-to-talk';

async function setup(listening = false) {
  const speech = { listening, start: jest.fn(async () => {}), stop: jest.fn(), release: jest.fn() };
  const onStart = jest.fn();
  const hook = await renderHook(() => useHoldToTalk(speech, { onStart }));
  return { ...hook, speech, onStart };
}

describe('useHoldToTalk', () => {
  it('starts holding on press, and a quick release keeps listening', async () => {
    const { result: r, speech, onStart } = await setup();
    await act(async () => r.current.pressProps.onPressIn());
    expect(speech.start).toHaveBeenCalledWith({ hold: true });
    expect(onStart).toHaveBeenCalled();
    await act(async () => r.current.pressProps.onPressOut());
    expect(speech.release).toHaveBeenCalledWith('keep');
  });

  it('sends on release after a long press, and says so while held', async () => {
    const { result: r, speech } = await setup();
    await act(async () => r.current.pressProps.onPressIn());
    await act(async () => r.current.pressProps.onLongPress());
    expect(r.current.held).toBe(true);
    await act(async () => r.current.pressProps.onPressOut());
    expect(speech.release).toHaveBeenCalledWith('send');
    expect(r.current.held).toBe(false);
  });

  it('sends when pressed while already listening, without starting again', async () => {
    const { result: r, speech } = await setup(true);
    await act(async () => r.current.pressProps.onPressIn());
    await act(async () => r.current.pressProps.onLongPress());
    await act(async () => r.current.pressProps.onPressOut());
    expect(speech.start).not.toHaveBeenCalled();
    expect(speech.stop).toHaveBeenCalled();
    expect(r.current.held).toBe(false);
  });

  it('toggles on a screen reader double tap, which cannot hold', async () => {
    const off = await setup();
    const activate = { nativeEvent: { actionName: 'activate' } } as never;
    await act(async () => off.result.current.pressProps.onAccessibilityAction(activate));
    expect(off.speech.start).toHaveBeenCalledWith();
    const on = await setup(true);
    await act(async () => on.result.current.pressProps.onAccessibilityAction(activate));
    expect(on.speech.stop).toHaveBeenCalled();
  });
});
