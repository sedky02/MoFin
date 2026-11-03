import { DataSection } from '@/components/settings/data-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function DataSettingsScreen() {
  return (
    <SettingsScreen title="Data">
      <DataSection />
    </SettingsScreen>
  );
}
