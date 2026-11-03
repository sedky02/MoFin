import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { handleApiError } from '@/core/form-errors';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/** The word to type, and the value the backend's `confirm` field must carry. */
export const CONFIRM_WORD = 'DELETE';

/**
 * A destructive action behind a typed word. There is no password to ask for (a Google-only
 * account has none), so the word is what stops a stray tap: the action button stays disabled until
 * it is typed (surrounding spaces are ignored, as on the web). `onConfirm` does the work and
 * throws on failure, which shows as a toast; on success the dialog closes itself unless
 * `closeWhenDone` is false, for an action that navigates away.
 */
export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  pendingText,
  failureMessage,
  closeWhenDone = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  actionLabel: string;
  pendingText: string;
  failureMessage: string;
  closeWhenDone?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [pending, setPending] = React.useState(false);
  const [text, setText] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  // The action stays disabled until the word is typed, so a stray tap can't reach it at all.
  const typed = text.trim() === CONFIRM_WORD;

  function reset() {
    setText('');
    setError(undefined);
  }

  function changeOpen(next: boolean) {
    if (pending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function action() {
    if (pending) return;
    if (!typed) {
      setError(`Type ${CONFIRM_WORD} to confirm.`);
      return;
    }
    setError(undefined);
    setPending(true);
    haptics.warning();
    try {
      await onConfirm();
    } catch (err) {
      setPending(false);
      handleApiError(err, { fallback: failureMessage });
      return;
    }
    if (closeWhenDone) {
      setPending(false);
      reset();
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <View className="gap-1.5">
          <Text className="text-sm font-medium">Type {CONFIRM_WORD} to confirm</Text>
          <Input
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (error) setError(undefined);
            }}
            editable={!pending}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
            accessibilityHint={error}
            returnKeyType="done"
            onSubmitEditing={action}
            className={cn('min-h-11', error && 'border-destructive')}
          />
          {error ? (
            <Text role="alert" className="text-sm text-destructive">
              {error}
            </Text>
          ) : null}
        </View>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            <Text>Cancel</Text>
          </AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: the dialog must stay open while this runs or fails. */}
          <Button
            variant="destructive"
            disabled={pending || !typed}
            aria-busy={pending}
            accessibilityLabel={pending ? pendingText : actionLabel}
            onPress={action}>
            {pending ? <ActivityIndicator size="small" color="#fff" /> : null}
            <Text>{pending ? pendingText : actionLabel}</Text>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
