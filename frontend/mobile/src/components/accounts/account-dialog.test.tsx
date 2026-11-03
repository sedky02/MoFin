import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AccountDialog } from './account-dialog';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdate = jest.fn().mockResolvedValue({});
jest.mock('@/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: [] }),
  useCreateAccount: () => ({ mutateAsync: mockCreate }),
  useUpdateAccount: () => ({ mutateAsync: mockUpdate }),
}));
jest.mock('@/lib/device-hints', () => ({ guessDeviceCurrency: () => 'TND' }));

async function setup(props: Partial<React.ComponentProps<typeof AccountDialog>> = {}) {
  const onOpenChange = jest.fn();
  await render(
    <>
      <AccountDialog open onOpenChange={onOpenChange} {...props} />
      <PortalHost />
    </>,
  );
  return onOpenChange;
}

beforeEach(() => jest.clearAllMocks());

describe('AccountDialog', () => {
  it('starts with a type-named account in the device currency', async () => {
    await setup();
    expect((await screen.findByLabelText('Name')).props.value).toBe('Main bank account');
    expect(screen.getByLabelText(/^Currency: TND/)).toBeTruthy();
  });

  it('renames with the type until the name is edited', async () => {
    await setup();
    await fireEvent.press(await screen.findByLabelText('Cash'));
    expect(screen.getByLabelText('Name').props.value).toBe('Cash wallet');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Stash');
    await fireEvent.press(screen.getByLabelText('Savings'));
    expect(screen.getByLabelText('Name').props.value).toBe('Stash');
  });

  it('rejects a bad opening balance and a blank name without calling the API', async () => {
    await setup();
    await fireEvent.changeText(await screen.findByLabelText('Opening balance'), 'abc');
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('Enter an amount, like 5000 or -250.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), ' ');
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates with the opening balance rounded to the currency', async () => {
    const onOpenChange = await setup();
    await fireEvent.changeText(await screen.findByLabelText('Opening balance'), '-12.5');
    await fireEvent.press(screen.getByText('Create account'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ name: 'Main bank account', type: 'BANK', currency: 'TND', openingBalance: '-12.500' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
