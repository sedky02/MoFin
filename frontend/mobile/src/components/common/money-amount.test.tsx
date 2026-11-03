import { render, screen } from '@testing-library/react-native';

import { MoneyAmount } from '@/components/common/money-amount';

describe('MoneyAmount', () => {
  it.each([
    ['1234.5', 'USD', '$1,234.50'],
    ['1234.5', 'EUR', '€1,234.50'],
    ['1234.5', 'TND', '1,234.500 TND'],
    ['1234', 'JPY', '¥1,234'],
    ['-5.5', 'TND', '-5.500 TND'],
  ])('shows %s %s as %s, and reads the same full value to a screen reader', async (amount, currency, expected) => {
    await render(<MoneyAmount amount={amount} currency={currency} />);
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByLabelText(expected)).toBeTruthy();
  });

  it('compact text still has the full value as its accessible label', async () => {
    await render(<MoneyAmount amount="1500" currency="EUR" compact />);
    expect(screen.getByText('€1.5K')).toBeTruthy();
    expect(screen.getByLabelText('€1,500.00')).toBeTruthy();
  });

  it('signed adds + only to positive non-zero amounts', async () => {
    await render(
      <>
        <MoneyAmount amount="5" currency="USD" signed />
        <MoneyAmount amount="0" currency="USD" signed />
        <MoneyAmount amount="-5" currency="USD" signed />
      </>,
    );
    expect(screen.getByText('+$5.00')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.getByText('-$5.00')).toBeTruthy();
  });

  it('shows an unparseable amount as-is rather than a wrong number', async () => {
    await render(<MoneyAmount amount="abc" currency="USD" signed />);
    expect(screen.getByText('abc')).toBeTruthy();
  });
});
