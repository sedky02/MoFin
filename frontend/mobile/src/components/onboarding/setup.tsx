import { View } from 'react-native';

import { FirstAccountForm } from '@/components/onboarding/first-account-form';
import { SetupTransactionStep } from '@/components/onboarding/setup-transaction-step';
import { Text } from '@/components/ui/text';
import { SETUP_STEPS } from '@/core/onboarding';
import type { Account } from '@/core/types';
import { cn } from '@/lib/utils';
import type { SetupState } from '@/hooks/useSetup';

type StepState = Extract<SetupState, { status: 'step' }>;

/**
 * The first-run setup. Both steps sit in the same frame (a step bar, a title, one line, one card),
 * so moving on changes what is inside it and nothing else.
 */
export function Setup({ step, accounts, skip, name }: Pick<StepState, 'step' | 'accounts' | 'skip'> & { name?: string }) {
  const index = SETUP_STEPS.indexOf(step);
  const first = name?.trim().split(/\s+/)[0];
  return (
    <View className="gap-6">
      <View>
        <View className="flex-row items-center gap-3">
          <Text style={{ fontVariant: ['tabular-nums'] }} className="text-xs font-medium text-muted-foreground">
            Step {index + 1} of {SETUP_STEPS.length}
          </Text>
          <View aria-hidden className="flex-1 flex-row gap-1.5">
            {SETUP_STEPS.map((id, i) => (
              <View key={id} className={cn('h-1 flex-1 rounded-full', i <= index ? 'bg-primary' : 'bg-secondary')} />
            ))}
          </View>
        </View>
        <Text role="heading" aria-level={1} className="mt-4 text-[28px] font-semibold leading-tight tracking-tight">
          {step === 'account' ? 'Add your first account' : 'Record your first transaction'}
        </Text>
        <Text className="mt-2 text-[15px] text-muted-foreground">
          {step === 'account'
            ? `Welcome to MoFin${first ? `, ${first}` : ''}. Start with the account you use most.`
            : 'Log something you spent or earned, and your balance and charts start to move.'}
        </Text>
      </View>
      <View className="rounded-2xl bg-card p-5 shadow-sm shadow-black/5">
        {step === 'account' ? <FirstAccountForm /> : <SetupTransactionStep accounts={accounts as Account[]} skip={skip} />}
      </View>
    </View>
  );
}
