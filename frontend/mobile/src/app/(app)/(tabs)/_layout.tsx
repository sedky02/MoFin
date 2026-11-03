import { Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { LayoutDashboard, Menu, PlusCircle, ReceiptText, Target } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/shell/app-header';
import { COLORS } from '@/theme/colors';

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const c = COLORS[colorScheme === 'dark' ? 'dark' : 'light'];
  return (
    <Tabs
      screenOptions={{
        header: (props) => <AppHeader {...props} />,
        tabBarActiveTintColor: colorScheme === 'dark' ? c.primary : c['primary-text'],
        tabBarInactiveTintColor: c['muted-foreground'],
        // Explicit height: the web tab bar otherwise clips its labels, and this keeps all targets >= 44pt.
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: 60 + insets.bottom, paddingTop: 6, paddingBottom: 6 + insets.bottom },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: 'Transactions', tabBarIcon: ({ color, size }) => <ReceiptText color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          headerShown: false,
          tabBarAccessibilityLabel: 'New Transaction',
          tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} />,
        }}
        listeners={{
          // Add is an action, not a place: it opens the form over the tabs instead of selecting a tab.
          tabPress: (e) => {
            e.preventDefault();
            router.push('/transactions/new');
          },
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{ title: 'Goals', tabBarIcon: ({ color, size }) => <Target color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }}
      />
    </Tabs>
  );
}
