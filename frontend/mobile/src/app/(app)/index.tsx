import { Redirect } from 'expo-router';

// The signed-in entry point is the Dashboard tab.
export default function Index() {
  return <Redirect href="/dashboard" />;
}
