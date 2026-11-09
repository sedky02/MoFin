import { Link } from 'expo-router';
import { Spinner } from '@/components/ui/themed-native';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signOut } from '@/api/session';
import { MORE_GROUPS, moreSubtitle, type MoreCounts, type MoreHref, type MoreTone } from '@/components/shell/nav-items';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAccounts } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useConnectedApps } from '@/hooks/useConnectedApps';
import { useGoals } from '@/hooks/useGoals';
import { useUser } from '@/hooks/useUser';
import { ChevronRight, FlaskConical, LogOut } from '@/lib/icons';
import { initials } from '@/lib/initials';
import { cn } from '@/lib/utils';

const TILE: Record<MoreTone, { box: string; icon: string }> = {
  money: { box: 'bg-primary/15', icon: 'text-primary-text' },
  ai: { box: 'bg-chart-2/15', icon: 'text-chart-2' },
  app: { box: 'bg-secondary', icon: 'text-foreground' },
};

function Row({
  href,
  label,
  subtitle,
  icon,
  tone,
  badge,
  last,
}: {
  href: MoreHref | '/settings/profile' | '/_dev/kitchen-sink';
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  tone: MoreTone;
  badge?: number;
  last?: boolean;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        role="link"
        accessibilityLabel={subtitle ? `${label}. ${subtitle}` : label}
        className={cn('min-h-16 flex-row items-center gap-3.5 px-4 py-3 active:bg-accent', !last && 'border-b border-border/60')}>
        <View aria-hidden className={cn('size-10 items-center justify-center rounded-xl', TILE[tone].box)}>
          <Icon as={icon} size={20} className={TILE[tone].icon} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-medium">{label}</Text>
          {subtitle ? (
            <Text numberOfLines={2} className="mt-0.5 text-sm text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {badge ? (
          <Badge>
            <Text>{badge > 99 ? '99+' : badge}</Text>
          </Badge>
        ) : null}
        <Icon as={ChevronRight} size={18} aria-hidden className="text-muted-foreground" />
      </Pressable>
    </Link>
  );
}

function Group({ title, highlight, children }: { title: string; highlight?: boolean; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text role="heading" aria-level={2} className="px-1 text-sm font-semibold text-muted-foreground">
        {title}
      </Text>
      <View className={cn('overflow-hidden rounded-2xl border bg-card', highlight ? 'border-chart-2/40' : 'border-border')}>{children}</View>
    </View>
  );
}

/**
 * Who is signed in, then everything the tab bar has no room for, grouped, each row with a live line
 * ("3 accounts", "2 active goals").
 */
export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const [signingOut, setSigningOut] = React.useState(false);
  const { data: user } = useUser();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: goals } = useGoals('active');
  const { data: apps } = useConnectedApps(!user?.isDemo);
  const counts: MoreCounts = {
    accounts: accounts?.length,
    categories: categories?.length,
    activeGoals: goals?.length,
    connectedApps: apps?.length,
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4" contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
      <Link href="/settings/profile" asChild>
        <Pressable
          role="link"
          accessibilityLabel={`Profile: ${user?.displayName || user?.email || 'you'}`}
          className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-card p-4 active:bg-accent">
          <View aria-hidden className="size-12 items-center justify-center rounded-full bg-primary/15">
            <Text className="text-base font-semibold text-primary-text">{initials(user?.displayName, user?.email)}</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-base font-semibold">
              {user?.displayName || 'Your profile'}
            </Text>
            <Text numberOfLines={1} className="text-sm text-muted-foreground">
              {user?.isDemo ? 'Demo account' : (user?.email ?? '')}
            </Text>
          </View>
          <Icon as={ChevronRight} size={18} aria-hidden className="text-muted-foreground" />
        </Pressable>
      </Link>

      {MORE_GROUPS.map((group) => (
        <Group key={group.title} title={group.title} highlight={group.items[0]?.tone === 'ai'}>
          {group.items.map((item, i) => (
            <Row
              key={item.href}
              href={item.href}
              label={item.label}
              subtitle={moreSubtitle(item.href, counts)}
              icon={item.icon}
              tone={item.tone}
              last={i === group.items.length - 1 && !(__DEV__ && group.title === 'App')}
            />
          ))}
          {__DEV__ && group.title === 'App' ? <Row href="/_dev/kitchen-sink" label="Kitchen sink (dev)" icon={FlaskConical} tone="app" last /> : null}
        </Group>
      ))}

      <Pressable
        role="button"
        accessibilityLabel="Sign out"
        disabled={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
        className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-card active:bg-accent">
        {signingOut ? <Spinner /> : <Icon as={LogOut} size={18} aria-hidden className="text-destructive" />}
        <Text className="text-base font-medium text-destructive">{signingOut ? 'Signing out…' : 'Sign out'}</Text>
      </Pressable>
    </ScrollView>
  );
}
