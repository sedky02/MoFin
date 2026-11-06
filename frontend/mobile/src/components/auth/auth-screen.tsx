import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

/**
 * The frame every sign-in screen shares: the wordmark, a two-line title with the second line in the
 * brand color (as on the web), a subtitle, then the form. Scrolls and moves above the keyboard.
 */
export function AuthScreen({
  title,
  accent,
  subtitle,
  children,
}: {
  title: string;
  accent?: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-sm self-center">
            <Text className="mb-8 text-lg font-bold tracking-tight">
              Mo<Text className="text-lg font-bold tracking-tight text-primary-text">Fin</Text>
            </Text>
            <View className="mb-8">
              <Text role="heading" aria-level={1} className="text-3xl font-bold leading-tight tracking-tight">
                {title}
                {accent ? (
                  <>
                    {'\n'}
                    <Text className="text-3xl font-bold leading-tight tracking-tight text-primary-text">{accent}</Text>
                  </>
                ) : null}
              </Text>
              {subtitle ? <Text className="mt-2 text-sm text-muted-foreground">{subtitle}</Text> : null}
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function OrDivider() {
  return (
    <View className="my-5 flex-row items-center gap-3" aria-hidden>
      <View className="h-px flex-1 bg-border" />
      <Text className="text-xs text-muted-foreground">OR</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
