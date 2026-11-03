import { LayoutDashboard } from 'lucide-react-native';

import { PlaceholderScreen } from '@/components/shell/placeholder-screen';

// Placeholder: the dashboard is built in a later phase.
export default function DashboardScreen() {
  return <PlaceholderScreen tabs icon={LayoutDashboard} title="Dashboard" description="Your balances and recent activity will appear here." />;
}
