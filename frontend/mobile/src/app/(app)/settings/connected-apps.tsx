import { ConnectedAppsSection } from '@/components/settings/connected-apps-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function ConnectedAppsSettingsScreen() {
  return (
    <SettingsScreen title="Connected AI apps">
      <ConnectedAppsSection />
    </SettingsScreen>
  );
}
