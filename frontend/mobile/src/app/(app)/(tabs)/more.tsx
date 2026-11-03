import { Link } from 'expo-router';
import { ChevronRight, FlaskConical } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signOut } from '@/api/session';
import { MORE_ITEMS } from '@/components/shell/nav-items';
import { UserCard } from '@/components/shell/user-card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { usePendingDraftCount } from '@/hooks/useDrafts';

export default function MoreScreen() {
  const [signingOut, setSigningOut] = React.useState(false);
  const { data: pending } = usePendingDraftCount();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4"
      contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
      <View className="overflow-hidden rounded-xl border border-border bg-card">
        {MORE_ITEMS.map((item, i) => {
          const count = item.badge === 'drafts' ? pending : undefined;
          return (
            <React.Fragment key={item.href}>
              {i > 0 ? <Separator /> : null}
              <Link href={item.href} asChild>
                <Pressable
                  role="link"
                  accessibilityLabel={count ? `${item.label}, ${count} pending` : item.label}
                  accessibilityHint={item.description}
                  className="min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-accent">
                  <Icon as={item.icon} size={22} aria-hidden className="text-muted-foreground" />
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-medium">{item.label}</Text>
                    <Text numberOfLines={1} className="text-sm text-muted-foreground">
                      {item.description}
                    </Text>
                  </View>
                  {count ? (
                    <Badge>
                      <Text>{count > 99 ? '99+' : count}</Text>
                    </Badge>
                  ) : null}
                  <Icon as={ChevronRight} size={18} aria-hidden className="text-muted-foreground" />
                </Pressable>
              </Link>
            </React.Fragment>
          );
        })}
        {__DEV__ ? (
          <>
            <Separator />
            <Link href="/_dev/kitchen-sink" asChild>
              <Pressable role="link" accessibilityLabel="Kitchen sink (development only)" className="min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-accent">
                <Icon as={FlaskConical} size={22} aria-hidden className="text-muted-foreground" />
                <Text className="flex-1 text-base font-medium">Kitchen sink (dev)</Text>
                <Icon as={ChevronRight} size={18} aria-hidden className="text-muted-foreground" />
              </Pressable>
            </Link>
          </>
        ) : null}
      </View>
      <UserCard
        signingOut={signingOut}
        onSignOut={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
    </ScrollView>
  );
}
