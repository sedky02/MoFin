import { ProfileSection } from '@/components/settings/profile-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function ProfileSettingsScreen() {
  return (
    <SettingsScreen title="Profile">
      <ProfileSection />
    </SettingsScreen>
  );
}
