import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/common/logo-mark';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * The frame every sign-in screen shares: a short dark header with the MoFin name over two faint
 * rings, then a sheet with the title (second line in the brand color), a subtitle and the form.
 * `centered` is for result screens, which put a scene above a centered title.
 */
export function AuthScreen({
  title,
  accent,
  subtitle,
  scene,
  centered = false,
  children,
}: {
  title: string;
  accent?: string;
  subtitle?: React.ReactNode;
  scene?: React.ReactNode;
  centered?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-[#0a0a09]">
      <StatusBar style="light" />
      <SafeAreaView className="flex-1" edges={['top']}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled" bounces={false}>
            <View className="h-[104px] overflow-hidden px-6 pt-7">
              <View
                aria-hidden
                pointerEvents="none"
                className="absolute -top-24 -right-16 size-[210px] rounded-full border border-brand-lime/10"
              />
              <View
                aria-hidden
                pointerEvents="none"
                className="absolute -top-36 -right-28 size-[320px] rounded-full border border-white/5"
              />
              <View className="flex-row items-center gap-2">
                <LogoMark size={28} />
                <Text className="text-xl font-extrabold tracking-tight text-brand-lime">MoFin</Text>
              </View>
            </View>
            <View
              className="-mt-6 flex-1 rounded-t-[28px] bg-background px-6 pt-9"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
              <View className="w-full max-w-sm self-center">
                {scene ? <View className="mb-5 items-center">{scene}</View> : null}
                <View className="mb-7">
                  <Text
                    role="heading"
                    aria-level={1}
                    className={cn('text-[28px] font-bold leading-[1.15] tracking-tight', centered && 'text-center')}>
                    {title}
                    {accent ? (
                      <>
                        {' '}
                        <Text className="text-[28px] font-bold leading-[1.15] tracking-tight text-primary-text">{accent}</Text>
                      </>
                    ) : null}
                  </Text>
                  {subtitle ? (
                    <Text className={cn('mt-3 text-sm leading-6 text-muted-foreground', centered && 'text-center')}>{subtitle}</Text>
                  ) : null}
                </View>
                {children}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

export function OrDivider() {
  return (
    <View className="my-6 flex-row items-center gap-3.5" aria-hidden>
      <View className="h-px flex-1 bg-border" />
      <Text className="text-xs tracking-widest text-muted-foreground">OR</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
