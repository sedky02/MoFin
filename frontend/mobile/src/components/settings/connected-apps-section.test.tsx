import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ConnectedAppsSection } from '@/components/settings/connected-apps-section';
import { json, mockFetch, renderWithUser, signedIn } from '@/components/settings/settings-test-utils';
import { getQueryClient } from '@/lib/query-client';

jest.mock('expo-router', () => {
  const { Fragment } = jest.requireActual('react');
  return { Link: ({ children }: { children: unknown }) => <Fragment>{children}</Fragment> };
});

const apps = [
  { clientId: 'c1', clientName: 'Claude', scope: 'read', active: true },
  { clientId: 'c/2', clientName: null, scope: 'read', active: false },
];

beforeEach(async () => {
  await signedIn();
});
afterAll(() => getQueryClient().clear());

it('explains how to connect an app when there are none', async () => {
  mockFetch(() => json(200, []));
  await renderWithUser(<ConnectedAppsSection />);
  expect(await screen.findByText(/^No apps connected yet/)).toBeTruthy();
  expect(screen.getByText('Connect an app')).toBeTruthy();
});

it('lists each app with its state, and disconnects one only after asking', async () => {
  const calls = mockFetch((c) => (c.method === 'DELETE' ? json(200, { revoked: true }) : json(200, apps)));
  await renderWithUser(<ConnectedAppsSection />);
  expect(await screen.findByText('Claude')).toBeTruthy();
  expect(screen.getByText('Active')).toBeTruthy();
  expect(screen.getByText('Unnamed app')).toBeTruthy();
  expect(screen.getByText('Signed out')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Disconnect this app'));
  expect(await screen.findByText('Disconnect this app?')).toBeTruthy();
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  const confirm = screen.getAllByText('Disconnect');
  await fireEvent.press(confirm[confirm.length - 1]);
  await waitFor(() => expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/oauth/grants/c%2F2']));
});

it('says when the list cannot be loaded', async () => {
  mockFetch(() => json(403, { statusCode: 403, message: 'Forbidden' }));
  await renderWithUser(<ConnectedAppsSection />);
  expect(await screen.findByText("Couldn't load connected apps.")).toBeTruthy();
});
