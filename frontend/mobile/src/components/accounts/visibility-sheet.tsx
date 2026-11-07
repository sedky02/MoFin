import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VISIBILITY_OPTIONS, visibilityOf, type AccountVisibilityLevel } from '@/core/account-privacy';
import type { Account } from '@/core/types';
import { Ban, Check, Eye, EyeOff, Lock } from '@/lib/icons';
import { cn } from '@/lib/utils';

export const LEVEL_ICON: Record<AccountVisibilityLevel, LucideIcon> = {
  visible: Eye,
  masked: EyeOff,
  private: Lock,
  hidden: Ban,
};

/** The four visibility levels as large rows, each with what it does. */
export function VisibilitySheet({
  account,
  onClose,
  onPick,
}: {
  account: Account | undefined;
  onClose: () => void;
  onPick: (account: Account, level: AccountVisibilityLevel) => void;
}) {
  const current = account ? visibilityOf(account) : undefined;
  return (
    <Dialog open={!!account} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-3 p-0 sm:max-w-md">
        <DialogHeader className="px-6 pt-2">
          <DialogTitle>{account?.name ?? 'Account'}</DialogTitle>
          <DialogDescription>Who sees the balance</DialogDescription>
        </DialogHeader>
        <View className="px-2 pb-3" accessibilityLabel="Visibility levels">
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = option.value === current;
            return (
              <Pressable
                key={option.value}
                role="radio"
                aria-checked={selected}
                accessibilityLabel={`${option.label}, ${option.effect}`}
                onPress={() => {
                  if (account && !selected) onPick(account, option.value);
                  onClose();
                }}
                className={cn('min-h-[60px] flex-row items-center gap-3 rounded-xl px-4 active:bg-accent', selected && 'bg-primary/10')}>
                <Icon as={LEVEL_ICON[option.value]} size={18} aria-hidden className="text-muted-foreground" />
                <View className="min-w-0 flex-1">
                  <Text className={cn('text-base', selected && 'font-semibold')}>{option.label}</Text>
                  <Text className="text-xs text-muted-foreground">{option.effect}</Text>
                </View>
                {selected ? <Icon as={Check} size={18} aria-hidden className="text-primary-text" /> : null}
              </Pressable>
            );
          })}
        </View>
      </DialogContent>
    </Dialog>
  );
}
