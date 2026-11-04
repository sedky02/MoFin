import { Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';

import { AppHeader } from '@/components/shell/app-header';
import { ADD_ROUTE, AppTabBar } from '@/components/shell/app-tab-bar';
import { haptics } from '@/lib/haptics';
import { LayoutDashboard, Menu, ReceiptText, Target } from '@/lib/icons';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      // freezeOnBlur: a tab you left doesn't re-render on every refetch or theme change while hidden;
      // it catches up once when you come back. Less work on the JS thread, so taps answer sooner.
      screenOptions={{ header: (props) => <AppHeader {...props} />, freezeOnBlur: true }}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: 'Transactions', tabBarIcon: ({ color, size }) => <ReceiptText color={color} size={size} /> }}
      />
      <Tabs.Screen
        name={ADD_ROUTE}
        options={{ title: 'Add', headerShown: false, tabBarAccessibilityLabel: 'New transaction' }}
        listeners={{
          // Add is an action, not a place: it opens the form over the tabs instead of selecting a tab.
          tabPress: (e) => {
            e.preventDefault();
            haptics.tap();
            router.push('/transactions/new');
          },
        }}
      />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: ({ color, size }) => <Target color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
    </Tabs>
  );
}
