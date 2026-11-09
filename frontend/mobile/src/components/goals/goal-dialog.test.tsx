import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { GoalDialog, suggestedGoalName } from './goal-dialog';

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
jest.mock('@/hooks/useActiveAccount', () => ({ useActiveAccount: () => ({ accountId: 'a1', ready: true }) }));
jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 'c1', name: 'Restaurants', type: 'EXPENSE', color: '#e05d2a', isSystem: false },
      { id: 'c2', name: 'Freelance', type: 'INCOME', color: '#2e5bff', isSystem: false },
    ],
  }),
}));
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
  it('starts with the three choices, like the web', async () => {
    await setup();
    expect(await screen.findByText("What's this goal for?")).toBeTruthy();
    expect(screen.getByLabelText('Save up, Grow an account to an amount')).toBeTruthy();
    expect(screen.getByLabelText('Earn more, Reach an income target')).toBeTruthy();
    expect(screen.getByLabelText('Spend less, Stay under a spending limit')).toBeTruthy();
  });

  it('labels every Spend less field plainly and writes the name from the choices', async () => {
    await setup();
    await fireEvent.press(await screen.findByLabelText('Spend less, Stay under a spending limit'));
    for (const label of ['Spending limit', 'Spending category', 'Account you pay from', 'Repeats', 'Goal name']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText('Goal name').props.value).toBe('Spending limit');
    await fireEvent.changeText(screen.getByLabelText('Spending limit'), '300');
    await waitFor(() => expect(screen.getByLabelText('Goal name').props.value).toBe('Spend under $300 a month'));
  });

  it('asks no category for Save up', async () => {
    await setup();
    await fireEvent.press(await screen.findByLabelText('Save up, Grow an account to an amount'));
    expect(screen.getByText('Amount to save')).toBeTruthy();
    expect(screen.queryByText('Spending category')).toBeNull();
    expect(screen.queryByText('Income category')).toBeNull();
  });

  it('creates a monthly cap on all spending', async () => {
    mockCreate.mockResolvedValue({ id: 'g1' });
    const onOpenChange = await setup();
    await fireEvent.press(await screen.findByLabelText('Spend less, Stay under a spending limit'));
    await fireEvent.changeText(screen.getByLabelText('Spending limit'), '300');
    await fireEvent.press(screen.getByText('Create goal'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      accountId: 'a1',
      name: 'Spend under $300 a month',
      type: 'EXPENSE',
      categoryId: null,
      targetAmount: '300',
      isRecurring: true,
      recurrenceUnit: 'MONTH',
      periodEnd: undefined,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('a one-off goal needs its last day', async () => {
    await setup();
    await fireEvent.press(await screen.findByLabelText('Save up, Grow an account to an amount'));
    await fireEvent.changeText(screen.getByLabelText('Amount to save'), '5000');
    await fireEvent.press(screen.getByLabelText('Just once'));
    await fireEvent.press(screen.getByText('Create goal'));
    expect(await screen.findByText('Pick the last day of the goal.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('goes back to the choices', async () => {
    await setup();
    await fireEvent.press(await screen.findByLabelText('Earn more, Reach an income target'));
    await fireEvent.press(screen.getByLabelText('Back to goal types'));
    expect(await screen.findByText("What's this goal for?")).toBeTruthy();
  });

  it('editing opens on the details, freezes the rest and sends only name and target', async () => {
    mockUpdate.mockResolvedValue({ id: 'g1' });
    await setup({
      goal: {
        id: 'g1',
        accountId: 'a1',
        categoryId: 'c1',
        category: { id: 'c1', name: 'Restaurants', color: '#e05d2a', archivedAt: null },
        name: 'Restaurants cap',
        type: 'EXPENSE',
        targetAmount: '300',
        isRecurring: true,
        recurrenceUnit: 'MONTH',
        periodStart: '2026-11-01T00:00:00Z',
        periodEnd: null,
        createdAt: '',
        updatedAt: '',
        currentInstance: null,
      },
    });
    expect(await screen.findByText('Edit · Spend less')).toBeTruthy();
    expect(screen.getByText('Restaurants')).toBeTruthy();
    expect(screen.getByText('Every month')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Goal name'), 'Eating out');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ id: 'g1', name: 'Eating out', targetAmount: '300' }));
  });
});

describe('suggestedGoalName', () => {
  it('says the goal in one line', () => {
    expect(suggestedGoalName('EXPENSE', 'MONTH', '300', 'USD', 'Restaurants')).toBe('Spend under $300 a month on Restaurants');
    expect(suggestedGoalName('INCOME', 'YEAR', '1000', 'USD', 'Freelance')).toBe('Earn $1,000 a year from Freelance');
    expect(suggestedGoalName('BALANCE', 'ONCE', '5000', 'USD', undefined, 'Savings')).toBe('Save $5,000 in Savings');
    expect(suggestedGoalName('EXPENSE', 'MONTH', null, 'USD')).toBe('Spending limit');
  });
});
