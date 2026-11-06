import { View } from 'react-native';

import { PickerField } from '@/components/transactions/transaction-form-fields';
import { Text } from '@/components/ui/text';
import { deviceLocale, useVoiceLocalePreference, VOICE_LOCALES } from '@/lib/voice-locale';

/**
 * The language voice questions are recognized in: the phone's own by default. Kept on this device,
 * since it is about the phone's recognizer.
 */
export function VoiceLanguageSetting() {
  const [locale, setLocale] = useVoiceLocalePreference();
  const device = deviceLocale();
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium">Voice language</Text>
      <PickerField
        title="Voice language"
        accessibilityLabel="Voice language"
        options={VOICE_LOCALES}
        value={locale || undefined}
        onChange={(v) => setLocale(v ?? '')}
        placeholder={`Same as phone (${device})`}
        emptyOption={`Same as phone (${device})`}
      />
      <Text className="text-xs text-muted-foreground">Used when you hold Add or tap the mic in Ask.</Text>
    </View>
  );
}
