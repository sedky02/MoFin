import { fireEvent, render, screen } from '@testing-library/react-native';
import * as React from 'react';

import { MoneyInput } from '@/components/common/money-input';

function Harness({ initial = '', currency = 'USD', allowNegative = false }: { initial?: string; currency?: string; allowNegative?: boolean }) {
  const [value, setValue] = React.useState(initial);
  return <MoneyInput value={value} onChange={setValue} currency={currency} allowNegative={allowNegative} />;
}

describe('MoneyInput', () => {
  it('keeps what was typed while typing', async () => {
    await render(<Harness />);
    const input = screen.getByLabelText('Amount in USD');
    await fireEvent.changeText(input, '1,234');
    expect(input.props.value).toBe('1,234');
  });

  it('tidies to the currency decimals on blur', async () => {
    await render(<Harness initial="12.5" />);
    const input = screen.getByLabelText('Amount in USD');
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('12.50');
  });

  it('shows how an ambiguous value is read', async () => {
    await render(<Harness initial="1,234" />);
    expect(screen.getByTestId('money-input-hint')).toBeTruthy();
  });

  it('uses a decimal keypad, or the full keyboard when negatives are allowed', async () => {
    const { rerender } = await render(<MoneyInput value="" onChange={() => {}} currency="USD" />);
    expect(screen.getByLabelText('Amount in USD').props.keyboardType).toBe('decimal-pad');
    await rerender(<MoneyInput value="" onChange={() => {}} currency="USD" allowNegative />);
    expect(screen.getByLabelText('Amount in USD').props.keyboardType).not.toBe('decimal-pad');
  });

  it('calls onBlur after tidying', async () => {
    const onBlur = jest.fn();
    await render(<MoneyInput value="3" onChange={() => {}} onBlur={onBlur} currency="USD" />);
    await fireEvent(screen.getByLabelText('Amount in USD'), 'blur');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
