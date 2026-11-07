import { NotificationsSection } from '@/components/settings/notifications-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function NotificationsSettingsScreen() {
  return (
    <SettingsScreen title="Notifications">
      <NotificationsSection />
    </SettingsScreen>
  );
}
