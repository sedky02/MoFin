import { PreferencesSection } from '@/components/settings/preferences-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function PreferencesSettingsScreen() {
  return (
    <SettingsScreen title="Preferences">
      <PreferencesSection />
    </SettingsScreen>
  );
}
