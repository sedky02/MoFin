import * as Clipboard from 'expo-clipboard';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Check, Copy } from '@/lib/icons';
import { toast } from '@/lib/toast';

/** Copies a value to the clipboard and says so for a moment. */
export function CopyButton({ value, accessibilityLabel }: { value: string; accessibilityLabel: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(true);
      toast.success('Copied to clipboard.');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  return (
    <Button variant="outline" className="min-h-11 gap-2" accessibilityLabel={accessibilityLabel} onPress={copy}>
      <Icon as={copied ? Check : Copy} size={16} aria-hidden />
      <Text>{copied ? 'Copied' : 'Copy'}</Text>
    </Button>
  );
}
