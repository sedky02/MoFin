import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useSetup } from '@/hooks/useSetup';
import { useStoredFlag } from '@/hooks/useStoredFlag';
import { useUser } from '@/hooks/useUser';

export const VOICE_TIP_KEY = 'mofin-voice-tip-shown';
const TIP_WIDTH = 280;
const TIP_MS = 8000;

/**
 * Shown once per device above Add: it waits until first-run setup is over and is marked shown the
 * moment it appears, so it never returns, even if the app closes while it is up.
 */
export function VoiceTip({ dismissed }: { dismissed: boolean }) {
  const [shown, markShown] = useStoredFlag(VOICE_TIP_KEY);
  const setup = useSetup();
  const { data: user } = useUser();
  const ready = !!user && setup.status === 'off';
  // Decided once, the first render it can show (marking it shown must not hide it straight away).
  const [visible, setVisible] = React.useState(false);
  const [decided, setDecided] = React.useState(false);
  if (!decided && ready && !shown) {
    setDecided(true);
    setVisible(true);
  }

  // Remember it the moment it appears, so it never comes back.
  React.useEffect(() => {
    if (visible) markShown();
  }, [visible, markShown]);

  React.useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), TIP_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible || dismissed) return null;
  return (
    // Centred on the Add button, wider than its column (the bubble is one line).
    <View pointerEvents="box-none" className="absolute bottom-full items-center pb-2" style={{ width: TIP_WIDTH, left: '50%', marginLeft: -TIP_WIDTH / 2 }}>
      <Pressable
        role="button"
        accessibilityLabel="Hold to add or ask with your voice. Dismiss"
        accessibilityLiveRegion="polite"
        onPress={() => setVisible(false)}
        className="items-center">
        <View className="rounded-xl bg-foreground px-3.5 py-2 shadow-md shadow-black/25">
          <Text className="text-sm font-medium text-background">Hold to add or ask with your voice</Text>
        </View>
        {/* The arrow points down at the Add button. */}
        <View aria-hidden className="-mt-1 size-3 rotate-45 bg-foreground" />
      </Pressable>
    </View>
  );
}
