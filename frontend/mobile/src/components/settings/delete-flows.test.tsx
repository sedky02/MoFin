// Delete all data and Delete account: the typed word, the endpoints, and what happens to the
// session on success and on failure. fetch is mocked; nothing reaches a backend.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { getSessionState, hasSession } from '@/api/session';
import { DataSection } from '@/components/settings/data-section';
import { DeleteAccountSection } from '@/components/settings/delete-account-section';
import {
  baseUser,
  json,
  mockFetch,
  REFRESH_KEY,
  renderWithUser,
  secure,
  signedIn,
  type Call,
} from '@/components/settings/settings-test-utils';
import { accountKeys, userKeys } from '@/core/query-keys';
import { getQueryClient } from '@/lib/query-client';
import { getToasts } from '@/lib/toast';

jest.mock('@/components/settings/save-export', () => ({ saveExport: jest.fn(async () => 'shared') }));

const deleteCalls = (calls: Call[]) => calls.filter((c) => c.path === '/users/me' && c.method === 'DELETE');
const resetCalls = (calls: Call[]) => calls.filter((c) => c.path === '/users/me/reset-data');

async function typeWord(word: string) {
  await fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), word);
}

beforeEach(async () => {
  await signedIn();
});

// The app's query client outlives the tests; clearing it drops its garbage-collection timers.
afterAll(() => getQueryClient().clear());

describe('Delete all data', () => {
  it('is a red row in the Data section, and is not offered to a demo', async () => {
    mockFetch(() => json(200, []));
    const { unmount } = await renderWithUser(<DataSection />);
    expect(screen.getByText('Danger zone')).toBeTruthy();
    expect(screen.getByText('Delete all data')).toBeTruthy();
    expect(screen.getByLabelText('Delete data…')).toBeEnabled();
    await unmount();

    await renderWithUser(<DataSection />, baseUser({ isDemo: true }));
    expect(screen.queryByText('Delete all data')).toBeNull();
    expect(screen.queryByText('Danger zone')).toBeNull();
    // The exports stay.
    expect(screen.getByLabelText('Export JSON')).toBeTruthy();
  });

  it("asks for the word with the web's wording, and keeps the button disabled until it is typed exactly", async () => {
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    await renderWithUser(<DataSection />);
    await fireEvent.press(screen.getByLabelText('Delete data…'));

    expect(await screen.findByText('Delete all your data?')).toBeTruthy();
    expect(
      screen.getByText(
        'Everything you recorded will be deleted for good. Your account, your sign-in and your connected AI apps stay.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Delete data')).toBeDisabled();
    for (const wrong of ['', 'delete', 'Delete', 'DELET', 'DELETED']) {
      await typeWord(wrong);
      expect(screen.getByLabelText('Delete data')).toBeDisabled();
      await fireEvent.press(screen.getByLabelText('Delete data'));
    }
    expect(resetCalls(calls)).toHaveLength(0);
  });

  it('posts the word to /users/me/reset-data, refetches everything cached, says so, and stays signed in', async () => {
    const calls = mockFetch((c) => {
      if (c.path === '/users/me/reset-data') return new Response(null, { status: 204 });
      if (c.path === '/users/me') return json(200, baseUser());
      return json(200, { data: [], total: 0 });
    });
    const client = getQueryClient();
    client.setQueryData(accountKeys.list('active'), [{ id: 'stale' }]);

    await renderWithUser(<DataSection />);
    await fireEvent.press(screen.getByLabelText('Delete data…'));
    await typeWord('DELETE');
    await fireEvent.press(screen.getByLabelText('Delete data'));

    await waitFor(() => expect(getToasts().map((t) => t.message)).toContain('All your data was deleted.'));
    expect(resetCalls(calls)).toEqual([
      { path: '/users/me/reset-data', method: 'POST', auth: 'Bearer access-1', body: { confirm: 'DELETE' } },
    ]);
    // The stale list is gone (reset to its initial state), and the session is untouched.
    expect(client.getQueryData(accountKeys.list('active'))).toBeUndefined();
    expect(getSessionState().status).toBe('signedIn');
    expect(hasSession()).toBe(true);
    expect(secure.__store.get(REFRESH_KEY)).toBe('refresh-1');
    // The dialog closed.
    await waitFor(() => expect(screen.queryByText('Delete all your data?')).toBeNull());
  });

  it('stays open, says it failed, and changes nothing when the request fails', async () => {
    mockFetch(() => json(500, { statusCode: 500, message: '' }));
    const client = getQueryClient();
    client.setQueryData(accountKeys.list('active'), [{ id: 'kept' }]);

    await renderWithUser(<DataSection />);
    await fireEvent.press(screen.getByLabelText('Delete data…'));
    await typeWord('DELETE');
    await fireEvent.press(screen.getByLabelText('Delete data'));

    await waitFor(() => expect(getToasts().map((t) => t.message)).toContain("Couldn't delete your data. Please try again."));
    expect(screen.getByText('Delete all your data?')).toBeTruthy();
    expect(client.getQueryData(accountKeys.list('active'))).toEqual([{ id: 'kept' }]);
    expect(getSessionState().status).toBe('signedIn');
  });
});

describe('Delete account', () => {
  it('lists what goes and points to Delete data for starting over', async () => {
    mockFetch(() => json(200, {}));
    await renderWithUser(<DeleteAccountSection />);
    expect(screen.getByText("Permanently deletes your account and everything in it. This can't be undone.")).toBeTruthy();
    expect(screen.getByText('connected AI apps and every signed-in session.')).toBeTruthy();
    expect(screen.getByText(/use Delete data under Data instead/)).toBeTruthy();
  });

  it('is only an explanation for a demo, with no button', async () => {
    mockFetch(() => json(200, {}));
    await renderWithUser(<DeleteAccountSection />, baseUser({ isDemo: true }));
    expect(screen.getByText('This demo and everything in it are deleted automatically when it ends.')).toBeTruthy();
    expect(screen.queryByLabelText('Delete account…')).toBeNull();
  });

  it('keeps the button disabled until DELETE is typed, and sends nothing before', async () => {
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    await renderWithUser(<DeleteAccountSection />);
    await fireEvent.press(screen.getByLabelText('Delete account…'));
    expect(await screen.findByText('Delete your account?')).toBeTruthy();
    expect(
      screen.getByText("Your account and all of its data will be deleted for good, and you'll be signed out everywhere."),
    ).toBeTruthy();
    expect(screen.getByLabelText('Delete account')).toBeDisabled();
    await typeWord('delete');
    await fireEvent.press(screen.getByLabelText('Delete account'));
    expect(screen.getByLabelText('Delete account')).toBeDisabled();
    expect(deleteCalls(calls)).toHaveLength(0);
    expect(getSessionState().status).toBe('signedIn');
  });

  it('sends DELETE /users/me with the word, then clears the session, SecureStore and the cache', async () => {
    const calls = mockFetch((c) => {
      if (c.path === '/users/me' && c.method === 'DELETE') return new Response(null, { status: 204 });
      // The account is gone: the logout that follows is refused, and that must not matter.
      if (c.path === '/auth/logout') return json(401, { statusCode: 401, message: 'Unauthorized' });
      return json(404, { statusCode: 404, message: 'Not found' });
    });
    await renderWithUser(<DeleteAccountSection />);
    expect(getQueryClient().getQueryData(userKeys.me)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Delete account…'));
    await typeWord(' DELETE ');
    await fireEvent.press(screen.getByLabelText('Delete account'));

    await waitFor(() => expect(getSessionState().status).toBe('signedOut'));
    expect(deleteCalls(calls)).toEqual([
      { path: '/users/me', method: 'DELETE', auth: 'Bearer access-1', body: { confirm: 'DELETE' } },
    ]);
    expect(hasSession()).toBe(false);
    await waitFor(() => expect(secure.__store.has(REFRESH_KEY)).toBe(false));
    expect(getQueryClient().getQueryData(userKeys.me)).toBeUndefined();
    expect(getToasts().map((t) => t.message)).toContain('Your account and its data were deleted.');
  });

  it('keeps the session and the dialog when the delete is refused', async () => {
    for (const status of [500, 429, 403]) {
      await signedIn();
      const calls = mockFetch(() => json(status, { statusCode: status, message: status === 403 ? 'Nope' : '' }));
      const { unmount } = await renderWithUser(<DeleteAccountSection />);
      await fireEvent.press(screen.getByLabelText('Delete account…'));
      await typeWord('DELETE');
      await fireEvent.press(screen.getByLabelText('Delete account'));

      await waitFor(() => expect(getToasts().length).toBeGreaterThan(0));
      expect(getSessionState().status).toBe('signedIn');
      expect(hasSession()).toBe(true);
      expect(secure.__store.get(REFRESH_KEY)).toBe('refresh-1');
      expect(getQueryClient().getQueryData(userKeys.me)).toBeTruthy();
      expect(calls.some((c) => c.path === '/auth/logout')).toBe(false);
      // Still open, and ready to try again.
      expect(screen.getByText('Delete your account?')).toBeTruthy();
      expect(screen.getByLabelText('Delete account')).toBeEnabled();
      await unmount();
    }
  });

  it('keeps the session when the network fails', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await renderWithUser(<DeleteAccountSection />);
    await fireEvent.press(screen.getByLabelText('Delete account…'));
    await typeWord('DELETE');
    await fireEvent.press(screen.getByLabelText('Delete account'));
    await waitFor(() =>
      expect(getToasts().map((t) => t.message)).toContain("Couldn't delete the account. Please try again."),
    );
    expect(getSessionState().status).toBe('signedIn');
    expect(secure.__store.get(REFRESH_KEY)).toBe('refresh-1');
  });
});
