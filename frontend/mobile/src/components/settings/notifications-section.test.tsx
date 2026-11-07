import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { json, mockFetch, renderWithUser, signedIn } from '@/components/settings/settings-test-utils';
import { NotificationsSection } from '@/components/settings/notifications-section';
import { getQueryClient } from '@/lib/query-client';

const permissions = Notifications.getPermissionsAsync as jest.Mock;

beforeEach(async () => {
  await signedIn();
  permissions.mockResolvedValue({ status: 'granted', canAskAgain: true });
});
afterAll(() => getQueryClient().clear());

it('shows both choices and saves a change', async () => {
  const calls = mockFetch((c) =>
    c.method === 'PATCH' ? json(200, { notifyMcpDrafts: false, notifyRecurring: true }) : json(200, { notifyMcpDrafts: true, notifyRecurring: true }),
  );
  await renderWithUser(<NotificationsSection />);
  const drafts = await screen.findByLabelText('Drafts from connected apps');
  expect(screen.getByLabelText('Recurring transactions posted')).toBeTruthy();

  await fireEvent.press(drafts);
  await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ notifyMcpDrafts: false }));
});

it('says so, with a way to turn them on, when the phone has not allowed notifications', async () => {
  permissions.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  mockFetch(() => json(200, { notifyMcpDrafts: true, notifyRecurring: true }));
  await renderWithUser(<NotificationsSection />);
  expect(await screen.findByText('Notifications are off for MoFin on this phone.')).toBeTruthy();
  expect(screen.getByLabelText('Turn on notifications')).toBeTruthy();
});

it('points to the phone settings when the system will not ask again', async () => {
  permissions.mockResolvedValue({ status: 'denied', canAskAgain: false });
  mockFetch(() => json(200, { notifyMcpDrafts: true, notifyRecurring: true }));
  await renderWithUser(<NotificationsSection />);
  expect(await screen.findByLabelText('Open phone settings')).toBeTruthy();
});
