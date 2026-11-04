import { fireEvent, render, screen } from '@testing-library/react-native';

import { WeekChart } from '@/components/dashboard/week-chart';
import type { DailySeriesPoint } from '@/core/types';
import { addDaysIso } from '@/core/week';

const week: DailySeriesPoint[] = Array.from({ length: 7 }, (_, i) => ({
  date: addDaysIso('2026-11-02', i),
  income: '0',
  expenses: i === 0 ? '10' : i === 2 ? '40' : '0',
  balance: '100',
}));
const today = '2026-11-04';

async function renderChart() {
  await render(<WeekChart points={week} metric="expenses" currency="USD" today={today} />);
  await fireEvent(screen.getByLabelText(/^Week chart/), 'layout', { nativeEvent: { layout: { width: 300, height: 170 } } });
}

describe('WeekChart', () => {
  it('labels the y-axis with round amounts from zero', async () => {
    await renderChart();
    // The axis is decorative for screen readers (each bar names its own figures), so it's hidden from them.
    for (const label of ['$40', '$20', '$0']) expect(screen.getByText(label, { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows the exact amount over a tapped bar, and hides it on a second tap', async () => {
    await renderChart();
    expect(screen.queryByText('$10.00')).toBeNull();
    const monday = screen.getByLabelText(/^Monday, Nov 2: income/);
    await fireEvent.press(monday);
    expect(screen.getByText('$10.00')).toBeTruthy();
    await fireEvent.press(monday);
    expect(screen.queryByText('$10.00')).toBeNull();
  });

  it('does not offer days still ahead', async () => {
    await renderChart();
    expect(screen.getByLabelText(/^Thursday, Nov 5: not yet/).props.accessibilityState).toMatchObject({ disabled: true });
  });
});
