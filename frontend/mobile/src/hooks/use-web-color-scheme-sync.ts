import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Tailwind's `dark:` variants and the `.dark:root` CSS variables key off a `dark` class. On native
 * NativeWind handles that itself; on web nothing sets the class, so mirror the scheme onto <html>.
 */
export function useWebColorSchemeSync() {
  const { colorScheme } = useColorScheme();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', colorScheme === 'dark');
    document.documentElement.style.colorScheme = colorScheme === 'dark' ? 'dark' : 'light';
  }, [colorScheme]);
}
