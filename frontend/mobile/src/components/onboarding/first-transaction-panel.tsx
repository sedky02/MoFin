import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Plus, Sparkles } from '@/lib/icons';
import { cn } from '@/lib/utils';

const WAYS = [
  { href: '/transactions/new', icon: Plus, title: 'Record a transaction', text: 'Amount, category and account.', primary: true },
  { href: '/drafts', icon: Sparkles, title: 'Describe it in words', text: '“lunch 12.50”, reviewed before it’s saved.', primary: false },
] as const;

/**
 * Shown in place of the hero's chart while nothing is recorded: names the one next step and offers
 * its two ways in as equal, full-size tiles (the plain route filled, the AI one outlined).
 */
export function FirstTransactionPanel() {
  return (
    <View>
      <Text role="heading" aria-level={2} className="text-base font-semibold">
        Record your first transaction
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">Your balance, charts and goals fill in from here.</Text>
      <View className="mt-4 gap-3">
        {WAYS.map(({ href, icon, title, text, primary }) => (
          <Pressable
            key={href}
            role="link"
            accessibilityLabel={`${title}. ${text}`}
            onPress={() => router.push(href)}
            className={cn(
              'min-h-[72px] flex-row items-center gap-3.5 rounded-xl p-4',
              primary ? 'bg-primary active:opacity-90' : 'border border-foreground/40 bg-card active:bg-muted/60 dark:border-border dark:bg-muted',
            )}>
            <View className={cn('size-10 items-center justify-center rounded-xl', primary ? 'bg-white/50 dark:bg-black/10' : 'bg-primary/15')}>
              <Icon as={icon} size={20} aria-hidden className={primary ? 'text-primary-foreground' : 'text-primary-text'} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className={cn('text-sm font-semibold', primary && 'text-primary-foreground')}>{title}</Text>
              <Text className={cn('text-sm', primary ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{text}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
