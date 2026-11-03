// Security: who gets the password form, what the change sends (and keeps), and sign out everywhere.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { getSessionState, hasSession } from '@/api/session';
import { SecuritySection } from '@/components/settings/security-section';
import { baseUser, json, mockFetch, REFRESH_KEY, renderWithUser, secure, signedIn } from '@/components/settings/settings-test-utils';
import { userKeys } from '@/core/query-keys';
import { getQueryClient } from '@/lib/query-client';
import { getToasts } from '@/lib/toast';

const toastTitles = () => getToasts().map((t) => t.message);

async function fillPassword(current: string, next: string, repeat = next) {
  await fireEvent.changeText(screen.getByLabelText('Current password'), current);
  await fireEvent.changeText(screen.getByLabelText('New password'), next);
  await fireEvent.changeText(screen.getByLabelText('Repeat new password'), repeat);
}

beforeEach(async () => {
  await signedIn();
});

// The app's query client outlives the tests; clearing it drops its garbage-collection timers.
afterAll(() => getQueryClient().clear());

describe('who sees what', () => {
  it('offers the password form and sign out everywhere to an account with a password', async () => {
    mockFetch(() => json(200, {}));
    await renderWithUser(<SecuritySection />);
    expect(screen.getByText('Changing your password signs out every other device. This one stays signed in.')).toBeTruthy();
    expect(screen.getByLabelText('Current password')).toBeTruthy();
    expect(screen.getByLabelText('Sign out everywhere')).toBeTruthy();
  });

  it('hides the password form for a Google-only account, and keeps sign out everywhere', async () => {
    mockFetch(() => json(200, {}));
    await renderWithUser(<SecuritySection />, baseUser({ hasPassword: false }));
    expect(screen.getByText(/You sign in with Google, so there's no MoFin password to change/)).toBeTruthy();
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(screen.getByLabelText('Sign out everywhere')).toBeTruthy();
  });

  it('offers a demo neither, only the explanation', async () => {
    mockFetch(() => json(200, {}));
    await renderWithUser(<SecuritySection />, baseUser({ isDemo: true, hasPassword: false }));
    expect(screen.getByText(/The demo has no password/)).toBeTruthy();
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(screen.queryByLabelText('Sign out everywhere')).toBeNull();
  });
});

describe('change password', () => {
  it("checks the form before sending anything", async () => {
    const calls = mockFetch(() => json(200, { message: 'Password changed.' }));
    await renderWithUser(<SecuritySection />);
    await fillPassword('old-password', 'Abcdef1!', 'Abcdef1?');
    await fireEvent.press(screen.getByLabelText('Change password'));
    expect(await screen.findByText("The passwords don't match.")).toBeTruthy();
    await fillPassword('old-password', 'short');
    await fireEvent.press(screen.getByLabelText('Change password'));
    expect(await screen.findAllByText('Use at least 8 characters.')).toBeTruthy();
    expect(calls.filter((c) => c.path === '/auth/password/change')).toHaveLength(0);
  });

  it("shows the strength of the new password", async () => {
    mockFetch(() => json(200, {}));
    await renderWithUser(<SecuritySection />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'Correct#Horse9Battery');
    expect(screen.getByText('Strong')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('New password'), 'abc');
    expect(screen.getByText('Too short')).toBeTruthy();
  });

  it("sends this device's refresh token so the backend keeps this session, and keeps it locally", async () => {
    const calls = mockFetch(() => json(200, { message: 'Password changed.' }));
    await renderWithUser(<SecuritySection />);
    await fillPassword('old-password', 'Abcdef1!xyz');
    await fireEvent.press(screen.getByLabelText('Change password'));

    await waitFor(() => expect(toastTitles()).toContain('Password changed. Other devices were signed out.'));
    expect(calls.filter((c) => c.path === '/auth/password/change')).toEqual([
      {
        path: '/auth/password/change',
        method: 'POST',
        auth: 'Bearer access-1',
        body: { currentPassword: 'old-password', newPassword: 'Abcdef1!xyz', refreshToken: 'refresh-1' },
      },
    ]);
    // No new tokens come back: the session (and the stored token) is exactly what it was.
    expect(getSessionState().status).toBe('signedIn');
    expect(secure.__store.get(REFRESH_KEY)).toBe('refresh-1');
    expect(calls.some((c) => c.path === '/auth/logout' || c.path === '/auth/refresh')).toBe(false);
    // The form is cleared.
    await waitFor(() => expect(screen.getByLabelText('Current password').props.value).toBe(''));
  });

  it('puts a wrong current password on its field and keeps the session', async () => {
    mockFetch(() =>
      json(400, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [{ path: 'currentPassword', message: 'The current password is incorrect.' }],
      }),
    );
    await renderWithUser(<SecuritySection />);
    await fillPassword('wrong-one', 'Abcdef1!xyz');
    await fireEvent.press(screen.getByLabelText('Change password'));
    expect(await screen.findByText('The current password is incorrect.')).toBeTruthy();
    expect(getSessionState().status).toBe('signedIn');
  });
});

describe('sign out everywhere', () => {
  it('asks first, then revokes every session and signs out here', async () => {
    const calls = mockFetch((c) => (c.path === '/auth/sessions/revoke-all' ? new Response(null, { status: 204 }) : json(200, {})));
    await renderWithUser(<SecuritySection />);
    await fireEvent.press(screen.getByLabelText('Sign out everywhere'));
    expect(await screen.findByText('Sign out everywhere?')).toBeTruthy();
    expect(calls.some((c) => c.path === '/auth/sessions/revoke-all')).toBe(false);

    const buttons = screen.getAllByText('Sign out everywhere');
    await fireEvent.press(buttons[buttons.length - 1]);

    await waitFor(() => expect(getSessionState().status).toBe('signedOut'));
    expect(calls.filter((c) => c.path === '/auth/sessions/revoke-all')).toEqual([
      { path: '/auth/sessions/revoke-all', method: 'POST', auth: 'Bearer access-1', body: undefined },
    ]);
    expect(hasSession()).toBe(false);
    await waitFor(() => expect(secure.__store.has(REFRESH_KEY)).toBe(false));
    expect(getQueryClient().getQueryData(userKeys.me)).toBeUndefined();
    expect(toastTitles()).toContain("You've been signed out on every device. Sign in to continue.");
  });

  it('stays signed in when the revoke fails', async () => {
    mockFetch(() => json(500, { statusCode: 500, message: '' }));
    await renderWithUser(<SecuritySection />);
    await fireEvent.press(screen.getByLabelText('Sign out everywhere'));
    const buttons = await screen.findAllByText('Sign out everywhere');
    await fireEvent.press(buttons[buttons.length - 1]);
    await waitFor(() => expect(toastTitles()).toContain("Couldn't sign out everywhere. Please try again."));
    expect(getSessionState().status).toBe('signedIn');
    expect(secure.__store.get(REFRESH_KEY)).toBe('refresh-1');
  });
});
