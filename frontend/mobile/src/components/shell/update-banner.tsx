import * as Application from 'expo-application';
import { Linking, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { installedBuildNumber, isUpdateAvailable } from '@/core/update-check';
import { useAppRelease } from '@/hooks/useAppRelease';
import { useStoredFlag } from '@/hooks/useStoredFlag';
import { Download } from '@/lib/icons';

/**
 * Tells Android users a newer build is out (the app isn't on the Play Store yet). "Later" hides it
 * for that build only, so the next one asks again.
 */
export function UpdateBanner() {
  const android = Platform.OS === 'android';
  const { data } = useAppRelease(android);
  const latest = data?.android;
  const installed = installedBuildNumber(Application.nativeBuildVersion);
  const [dismissed, dismiss] = useStoredFlag(`mofin-update-dismissed-${latest?.build ?? 0}`);

  if (!android || !latest || dismissed || !isUpdateAvailable(installed, latest)) return null;

  return (
    <View
      role="status"
      accessibilityLiveRegion="polite"
      className="mb-4 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <Icon as={Download} size={18} aria-hidden className="text-primary-text" />
      <Text className="flex-1 text-sm">Version {latest.version} is available.</Text>
      <Button variant="ghost" size="sm" onPress={dismiss}>
        <Text>Later</Text>
      </Button>
      <Button size="sm" onPress={() => Linking.openURL(latest.url)}>
        <Text>Update</Text>
      </Button>
    </View>
  );
}
