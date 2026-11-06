import { SettingsScreen } from '@/components/settings/settings-screen';
import { WidgetsSection } from '@/components/settings/widgets-section';

export default function WidgetsSettingsScreen() {
  return (
    <SettingsScreen title="Widgets">
      <WidgetsSection />
    </SettingsScreen>
  );
}
