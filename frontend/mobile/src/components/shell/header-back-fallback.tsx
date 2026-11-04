import { router, type Href } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, type ColorValue } from 'react-native';

/** The header's back button for a stack screen that has no history (see `backFallbackHref`). */
export function HeaderBackFallback({ href, tintColor }: { href: Href; tintColor?: ColorValue }) {
  return (
    <Pressable
      role="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={() => router.replace(href)}
      className="ml-2 size-11 items-center justify-center rounded-full active:bg-accent">
      <ArrowLeft size={24} color={tintColor} />
    </Pressable>
  );
}
