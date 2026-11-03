import { fireEvent, render, screen } from '@testing-library/react-native';

import { MonthlySummaryCard } from '@/components/dashboard/monthly-summary';

const mockSummary = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/hooks/useAnalytics', () => ({
  useMonthlySummary: (...args: unknown[]) => {
    mockSummary(...args);
    return {
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      data: {
        year: 2026,
        month: 1,
        income: '1000.00',
        expenses: '250.00',
        savingsRate: '0.75',
        activeCurrencies: ['USD'],
        categoryBreakdown: [
          { category: 'Food', amount: '150.00' },
          { category: 'Rent', amount: '100.00' },
        ],
        incomeBreakdown: [],
      },
    };
  },
}));
jest.mock('@/hooks/useAccounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/hooks/useMainAccount', () => ({ useMainAccount: () => ({ accountId: undefined }) }));

describe('MonthlySummaryCard', () => {
  beforeEach(() => mockSummary.mockClear());

  it('asks for the UTC month and the shown currency in the all-accounts view', async () => {
    await render(<MonthlySummaryCard year={2026} month={1} currency="USD" />);
    expect(screen.getByText('January 2026')).toBeTruthy();
    expect(mockSummary).toHaveBeenLastCalledWith(2026, 1, undefined, 'USD');
  });

  it('shows the totals strip and the donut legend with shares', async () => {
    await render(<MonthlySummaryCard year={2026} month={1} currency="USD" />);
    expect(screen.getByText('$750.00')).toBeTruthy();
    expect(screen.getByText('75% saved')).toBeTruthy();
    expect(screen.getByLabelText('Spending by category: Food 60%, Rent 40%')).toBeTruthy();
    expect(screen.getByLabelText('Food, 60 percent')).toBeTruthy();
  });

  it('steps back across the year boundary, can return, and cannot go into the future', async () => {
    await render(<MonthlySummaryCard year={2026} month={1} currency="USD" />);
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('December 2025')).toBeTruthy();
    expect(mockSummary).toHaveBeenLastCalledWith(2025, 12, undefined, 'USD');
    await fireEvent.press(screen.getByLabelText('Back to this month'));
    expect(screen.getByText('January 2026')).toBeTruthy();
    expect(screen.getByLabelText('Next month').props.accessibilityState?.disabled).toBe(true);
  });
});
