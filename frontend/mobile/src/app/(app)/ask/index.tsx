import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskChatList } from '@/components/ask/ask-chat-list';

export default function AskScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="mx-auto w-full max-w-2xl p-4"
      contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
      <AskChatList />
    </ScrollView>
  );
}
