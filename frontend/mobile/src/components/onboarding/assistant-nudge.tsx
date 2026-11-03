import { router } from 'expo-router';
import { Plug, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** One quiet line on the dashboard, after setup: the AI assistants are what sets MoFin apart. */
export function AssistantNudge({ onClose }: { onClose: () => void }) {
  return (
    <View accessibilityLabel="Connect an assistant" className="flex-row flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card py-2 pl-4 pr-1 shadow-sm shadow-black/5">
      <Icon as={Plug} size={16} aria-hidden className="text-muted-foreground" />
      <Text className="min-w-0 flex-1 basis-48 text-sm">Connect Claude or ChatGPT to log and ask about your money in a chat.</Text>
      <Button variant="outline" size="lg" onPress={() => router.push('/connect')}>
        <Text>Connect</Text>
      </Button>
      <Pressable
        role="button"
        accessibilityLabel="Dismiss this suggestion"
        onPress={onClose}
        className="size-11 items-center justify-center rounded-full active:bg-secondary">
        <Icon as={X} size={18} aria-hidden className="text-muted-foreground" />
      </Pressable>
    </View>
  );
}
