import { SettingsScreen } from '@/components/settings/settings-screen';
import { SettingsMenu } from '@/components/settings/settings-menu';

export default function SettingsIndexScreen() {
  return (
    <SettingsScreen title="Settings">
      <SettingsMenu />
    </SettingsScreen>
  );
}
