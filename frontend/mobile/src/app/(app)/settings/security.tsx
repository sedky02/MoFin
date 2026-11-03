import { SecuritySection } from '@/components/settings/security-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function SecuritySettingsScreen() {
  return (
    <SettingsScreen title="Security">
      <SecuritySection />
    </SettingsScreen>
  );
}
