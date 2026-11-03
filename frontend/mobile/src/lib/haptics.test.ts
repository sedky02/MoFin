/* eslint-disable @typescript-eslint/no-require-imports */
import type { Platform as PlatformType } from 'react-native';

let Platform: typeof PlatformType;

// A fresh copy of the module per test: it reads the reduce-motion setting when first loaded.
async function load(reduceMotion: boolean, platformOs: 'ios' | 'web' = 'ios') {
  jest.resetModules();
  const rn = require('react-native');
  Platform = rn.Platform;
  Platform.OS = platformOs;
  jest.spyOn(rn.AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduceMotion);
  const Haptics = require('expo-haptics');
  const { haptics } = require('@/lib/haptics');
  await new Promise((r) => setTimeout(r, 0));
  return { haptics, Haptics };
}

describe('haptics', () => {
  it('fires on a device', async () => {
    const { haptics, Haptics } = await load(false);
    haptics.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('does nothing when reduce motion is on', async () => {
    const { haptics, Haptics } = await load(true);
    haptics.tap();
    haptics.warning();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('never throws when the haptic engine fails', async () => {
    const { haptics, Haptics } = await load(false);
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('no engine'));
    expect(() => haptics.tap()).not.toThrow();
  });

  it('is a no-op on web', async () => {
    const { haptics, Haptics } = await load(false, 'web');
    haptics.success();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});
