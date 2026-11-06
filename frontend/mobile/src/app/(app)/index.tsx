import { Redirect } from 'expo-router';

import { pendingInvite } from '@/lib/pending-invite';

// The signed-in entry point is the Dashboard tab, unless an invitation link was waiting for the
// person to sign in.
export default function Index() {
  return <Redirect href={pendingInvite() ? '/invitations' : '/dashboard'} />;
}
