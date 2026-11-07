import { AiProviderSection } from '@/components/settings/ai-provider-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function AiProviderSettingsScreen() {
  return (
    <SettingsScreen title="AI provider">
      <AiProviderSection />
    </SettingsScreen>
  );
}
