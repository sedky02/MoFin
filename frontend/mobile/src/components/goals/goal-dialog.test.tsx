import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { GoalDialog } from './goal-dialog';

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/components/transactions/datetime-field', () => jest.requireActual('@/components/transactions/datetime-field.test-double'));
jest.mock('@/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Everyday', type: 'BANK', currency: 'USD' },
      { id: 'a2', name: 'Dinar', type: 'BANK', currency: 'TND' },
    ],
  }),
}));
jest.mock('@/hooks/useActiveAccount', () => ({ useActiveAccount: () => ({ accountId: 'a2', ready: true }) }));
jest.mock('@/hooks/useGoals', () => ({
  useCreateGoal: () => ({ mutateAsync: mockCreate }),
  useUpdateGoal: () => ({ mutateAsync: mockUpdate }),
}));

async function setup(props: Partial<React.ComponentProps<typeof GoalDialog>> = {}) {
  const onOpenChange = jest.fn();
  await render(
    <>
      <GoalDialog open onOpenChange={onOpenChange} {...props} />
      <PortalHost />
    </>,
  );
  return onOpenChange;
}

beforeEach(() => jest.clearAllMocks());

describe('GoalDialog', () => {
  it('does not submit an empty form and shows every missing field', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('Create goal'));
    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(screen.getByText('Enter a valid amount.')).toBeTruthy();
    expect(screen.getByText('End date is required for a fixed goal.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates a fixed goal for the active account with the parsed 3-decimal target and closes', async () => {
    mockCreate.mockResolvedValue({ id: 'g1' });
    const onOpenChange = await setup();
    await fireEvent.changeText(await screen.findByLabelText('Name'), '  Trip ');
    await fireEvent.changeText(screen.getByLabelText('Target amount'), '1,234.5');
    await fireEvent.changeText(screen.getByLabelText('End date'), '2099-12-31');
    await fireEvent.press(screen.getByText('Create goal'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const input = mockCreate.mock.calls[0][0];
    expect(input).toMatchObject({ accountId: 'a2', name: 'Trip', type: 'BALANCE', isRecurring: false, periodEnd: '2099-12-31', recurrenceUnit: undefined });
    expect(input.targetAmount).toBe('1234.5');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('a recurring goal needs a repeat unit and sends no end date', async () => {
    mockCreate.mockResolvedValue({ id: 'g1' });
    await setup();
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Save');
    await fireEvent.changeText(screen.getByLabelText('Target amount'), '50');
    await fireEvent(screen.getByLabelText('Recurring'), 'checkedChange', true);
    await fireEvent.press(screen.getByText('Create goal'));
    expect(await screen.findByText('Pick how often this goal repeats.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Year'));
    await fireEvent.press(screen.getByText('Create goal'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ isRecurring: true, recurrenceUnit: 'YEAR', periodEnd: undefined });
  });

  it('stays open when the API refuses (the hook already toasted)', async () => {
    mockCreate.mockRejectedValue(new Error('nope'));
    const onOpenChange = await setup();
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Trip');
    await fireEvent.changeText(screen.getByLabelText('Target amount'), '10');
    await fireEvent.changeText(screen.getByLabelText('End date'), '2099-12-31');
    await fireEvent.press(screen.getByText('Create goal'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('editing sends only name and target', async () => {
    mockUpdate.mockResolvedValue({});
    await setup({
      goal: {
        id: 'g9', accountId: 'a1', name: 'Old', type: 'EXPENSE', targetAmount: '100', isRecurring: false,
        periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-12-31T00:00:00.000Z',
      } as never,
    });
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'New');
    await fireEvent.changeText(screen.getByLabelText('Target amount'), '250.75');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ id: 'g9', name: 'New', targetAmount: '250.75' }));
  });
});
