import { Link } from 'expo-router';
import { AppVersionRow } from '@/components/settings/app-version-row';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { settingsSections } from '@/components/settings/settings-logic';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useUser } from '@/hooks/useUser';
import { ChevronRight } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * The Settings list: one row per section of the web's Settings page, each opening its own screen.
 * Delete account sits apart at the end, in red, like the web's last card.
 */
export function SettingsMenu() {
  const { data: user } = useUser();
  const sections = settingsSections(user);
  const main = sections.filter((s) => s.id !== 'delete-account');
  const last = sections.find((s) => s.id === 'delete-account');

  return (
    <View>
      <View className="overflow-hidden rounded-xl border border-border bg-card">
        {main.map((s, i) => (
          <React.Fragment key={s.id}>
            {i > 0 ? <Separator /> : null}
            <MenuRow section={s} />
          </React.Fragment>
        ))}
      </View>
      {last ? (
        <View className={cn('mt-6 overflow-hidden rounded-xl border bg-card', last.tone === 'danger' ? 'border-destructive/30' : 'border-border')}>
          <MenuRow section={last} />
        </View>
      ) : null}
      <AppVersionRow />
    </View>
  );
}

function MenuRow({ section }: { section: ReturnType<typeof settingsSections>[number] }) {
  const danger = section.tone === 'danger';
  return (
    <Link href={section.href} asChild>
      <Pressable
        role="link"
        accessibilityLabel={section.label}
        accessibilityHint={section.summary}
        className="min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-accent">
        <View
          aria-hidden
          className={cn('size-9 items-center justify-center rounded-lg', danger ? 'bg-destructive/10' : 'bg-primary/15')}>
          <Icon as={section.icon} size={18} className={danger ? 'text-destructive' : 'text-primary-text'} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className={cn('text-base font-medium', danger && 'text-destructive')}>{section.label}</Text>
          <Text numberOfLines={2} className="text-sm text-muted-foreground">
            {section.summary}
          </Text>
        </View>
        <Icon as={ChevronRight} size={18} aria-hidden className="text-muted-foreground" />
      </Pressable>
    </Link>
  );
}
