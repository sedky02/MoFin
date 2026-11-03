import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FirstAccountForm } from '@/components/onboarding/first-account-form';
import { accountKeys } from '@/core/query-keys';

const mockCreate = jest.fn();
jest.mock('@/hooks/useAccounts', () => ({ useCreateAccount: () => ({ mutateAsync: mockCreate, isPending: false }) }));
jest.mock('@/lib/device-hints', () => ({ guessDeviceCurrency: () => 'TND' }));

async function setup() {
  const client = new QueryClient();
  await render(
    <QueryClientProvider client={client}>
      <FirstAccountForm />
    </QueryClientProvider>,
  );
  return client;
}

describe('FirstAccountForm', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: 'a1', name: 'Main bank account', type: 'BANK', currency: 'TND' });
  });

  it('starts filled in: a bank account, a name, the device currency (said so)', async () => {
    await setup();
    expect(screen.getByDisplayValue('Main bank account')).toBeTruthy();
    expect(screen.getByText(/Picked from where your device is\. It can't be changed later\./)).toBeTruthy();
  });

  it('renames with the type until the name is edited by hand', async () => {
    await setup();
    await fireEvent.press(screen.getByLabelText('Cash'));
    expect(screen.getByDisplayValue('Cash wallet')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Pocket money');
    await fireEvent.press(screen.getByLabelText('Savings'));
    expect(screen.getByDisplayValue('Pocket money')).toBeTruthy();
  });

  it('creates the account with what is on screen and seeds the cache', async () => {
    const client = await setup();
    await fireEvent.press(screen.getByLabelText('Create account'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ name: 'Main bank account', type: 'BANK', currency: 'TND' }));
    await waitFor(() => expect(client.getQueryData(accountKeys.list('active'))).toHaveLength(1));
    expect(await screen.findByText('Setting up your dashboard…')).toBeTruthy();
  });

  it('refuses a blank name', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText('Name'), '');
    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
