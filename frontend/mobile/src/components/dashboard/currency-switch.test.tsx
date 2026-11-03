import { fireEvent, render, screen } from '@testing-library/react-native';

import { CurrencySwitch } from '@/components/dashboard/currency-switch';

describe('CurrencySwitch', () => {
  it('renders nothing for a single currency', async () => {
    await render(<CurrencySwitch currencies={[{ code: 'USD' }]} value="USD" onChange={jest.fn()} />);
    expect(screen.queryByLabelText('Currency')).toBeNull();
  });

  it('marks the selected pill, labels overdrawn and active ones, and reports a change', async () => {
    const onChange = jest.fn();
    await render(
      <CurrencySwitch
        currencies={[{ code: 'USD' }, { code: 'EUR', overdrawn: true }, { code: 'TND', activity: true }]}
        value="USD"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('USD').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('EUR, overdrawn').props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(screen.getByLabelText('TND, has activity this month'));
    expect(onChange).toHaveBeenCalledWith('TND');
  });
});
