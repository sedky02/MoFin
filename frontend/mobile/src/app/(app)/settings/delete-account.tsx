import { DeleteAccountSection } from '@/components/settings/delete-account-section';
import { SettingsScreen } from '@/components/settings/settings-screen';

export default function DeleteAccountSettingsScreen() {
  return (
    <SettingsScreen title="Delete account">
      <DeleteAccountSection />
    </SettingsScreen>
  );
}
