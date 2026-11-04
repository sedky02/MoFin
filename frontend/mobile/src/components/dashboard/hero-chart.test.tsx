import { fireEvent, render, screen } from '@testing-library/react-native';

import { HeroChart } from '@/components/dashboard/hero-chart';
import type { MonthlySeriesPoint } from '@/core/types';

const points: MonthlySeriesPoint[] = [
  { month: '2026-09', income: '1000.00', expenses: '400.00', balance: '600.00' },
  { month: '2026-10', income: '0.00', expenses: '800.00', balance: '-200.00' },
];

describe('HeroChart', () => {
  it('gives each month a spoken name and the whole chart a text alternative', async () => {
    await render(<HeroChart points={points} metric="balance" currency="USD" />);
    // Layout width is unknown in jest; the alternative text is on the container regardless.
    expect(screen.getByLabelText(/^Six-month chart\. September 2026: income \$1,000\.00, expenses \$400\.00, balance \$600\.00/)).toBeTruthy();
    expect(screen.getByLabelText(/October 2026: income \$0\.00, expenses \$800\.00, balance -\$200\.00/)).toBeTruthy();
  });

  it("shows the current month's figures before any tap, with a hint to pick another", async () => {
    await render(<HeroChart points={points} metric="income" currency="USD" />);
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByText('-$200.00')).toBeTruthy();
    expect(screen.getByText(/Tap a bar for another month/)).toBeTruthy();
  });

  it('shows a tapped month, and goes back to the current month on a second tap', async () => {
    await render(<HeroChart points={points} metric="income" currency="USD" />);
    // The bars are drawn once the chart knows its width.
    await fireEvent(screen.getByLabelText(/^Six-month chart/), 'layout', { nativeEvent: { layout: { width: 300, height: 150 } } });
    const september = screen.getByLabelText(/^September 2026/);
    await fireEvent.press(september);
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.queryByText(/Tap a bar for another month/)).toBeNull();
    await fireEvent.press(september);
    expect(screen.getByText('October 2026')).toBeTruthy();
  });
});
