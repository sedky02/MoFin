import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePendingDraftCount } from '@/hooks/useDrafts';
import { ChevronRight, Sparkles } from '@/lib/icons';

/** Shown on the dashboard while AI drafts wait for review, so they aren't only findable under More. */
export function DraftsBanner() {
  const { data: pending } = usePendingDraftCount();
  if (!pending) return null;
  const title = pending === 1 ? '1 draft to review' : `${pending > 99 ? '99+' : pending} drafts to review`;
  return (
    <Link href="/drafts" asChild>
      <Pressable
        role="link"
        accessibilityLabel={`${title}. Open AI drafts`}
        className="flex-row items-center gap-3.5 rounded-2xl border border-chart-2/40 bg-card p-4 active:bg-accent">
        <View aria-hidden className="size-10 items-center justify-center rounded-xl bg-chart-2/15">
          <Icon as={Sparkles} size={20} className="text-chart-2" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold">{title}</Text>
          <Text className="mt-0.5 text-sm text-muted-foreground">Your assistant drafted them. Approve to record.</Text>
        </View>
        <Icon as={ChevronRight} size={18} aria-hidden className="text-muted-foreground" />
      </Pressable>
    </Link>
  );
}
