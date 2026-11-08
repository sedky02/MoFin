import { Stack } from 'expo-router';
import { KeyboardScrollView } from '@/components/common/keyboard-scroll-view';
import * as React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function SettingsScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen options={{ title }} />
      <KeyboardScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="mx-auto w-full max-w-2xl gap-6 p-4"
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        {children}
      </KeyboardScrollView>
    </>
  );
}
