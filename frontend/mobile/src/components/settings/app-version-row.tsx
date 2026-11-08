import * as Application from 'expo-application';
import { Linking, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { installedBuildNumber, isUpdateAvailable } from '@/core/update-check';
import { useAppRelease } from '@/hooks/useAppRelease';

/** Which build is installed and, on Android, whether a newer one can be downloaded. */
export function AppVersionRow() {
  const android = Platform.OS === 'android';
  const { data } = useAppRelease(android);
  const latest = data?.android;
  const installed = installedBuildNumber(Application.nativeBuildVersion);
  const version = Application.nativeApplicationVersion;
  const update = android && isUpdateAvailable(installed, latest);

  return (
    <View className="mt-6 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium">MoFin {version ?? 'dev'}</Text>
        <Text className="text-sm text-muted-foreground">
          {update && latest
            ? `Version ${latest.version} is available`
            : installed !== null
              ? `Build ${installed} · Up to date`
              : 'Development build'}
        </Text>
      </View>
      {update && latest ? (
        <Button size="sm" onPress={() => Linking.openURL(latest.url)}>
          <Text>Update</Text>
        </Button>
      ) : null}
    </View>
  );
}
