import { useColorScheme } from 'nativewind';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

// A smoke screen for the toolchain (Phase 1): Reusables + NativeWind + the lime theme, in both schemes.
export default function Index() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';

  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>MoFin</CardTitle>
          <CardDescription>Your money, tracked by a ledger you never balance by hand.</CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <Input placeholder="Amount" keyboardType="decimal-pad" accessibilityLabel="Amount" />
          <Button>
            <Text>Record a transaction</Text>
          </Button>
          <Button variant="outline" onPress={() => setColorScheme(dark ? 'light' : 'dark')}>
            <Text>{dark ? 'Switch to light' : 'Switch to dark'}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
