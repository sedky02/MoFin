import { router, type NativeStackHeaderProps } from 'expo-router';
import { Platform } from 'react-native';

import { HeaderBar, HeaderIconButton } from '@/components/shell/header-bar';
import { backFallbackHref } from '@/lib/back-fallback';
import { ArrowLeft, X } from '@/lib/icons';

/**
 * Header for every pushed screen: a round back arrow (or ✕ on a modal sheet), then the title, in the
 * same style as the tab screens. With no history (a page opened from a link or reloaded in the
 * browser) the button goes to the screen's usual parent instead of doing nothing.
 */
export function StackHeader({ navigation, route, options, back }: NativeStackHeaderProps) {
  const title = typeof options.title === 'string' ? options.title : route.name;
  const modal = options.presentation === 'modal' || options.presentation === 'formSheet';
  const goBack = () => {
    if (back || navigation.canGoBack()) navigation.goBack();
    else router.replace(backFallbackHref(route.name, route.params as Record<string, unknown> | undefined));
  };
  const right = typeof options.headerRight === 'function' ? options.headerRight({ canGoBack: !!back }) : undefined;
  return (
    <HeaderBar
      title={title}
      // An iOS sheet starts below the status bar; everywhere else the header does.
      insetTop={!(modal && Platform.OS === 'ios')}
      left={<HeaderIconButton icon={modal ? X : ArrowLeft} accessibilityLabel={modal ? 'Close' : 'Back'} onPress={goBack} />}
      right={right}
    />
  );
}
