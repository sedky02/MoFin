import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CurrencyPicker } from '@/components/common/currency-picker';
import { currencyOptions } from '@/lib/currency-options';

describe('currencyOptions', () => {
  it('lists pinned currencies first under "In use"', () => {
    const options = currencyOptions('', ['EUR']);
    expect(options[0]).toMatchObject({ code: 'EUR', group: 'In use' });
    expect(options[1].group).toBe('All currencies');
  });

  it('matches code or name, with code prefixes first', () => {
    expect(currencyOptions('euro').map((o) => o.code)).toContain('EUR');
    expect(currencyOptions('eur')[0].code).toBe('EUR');
  });

  it('has no groups when nothing is pinned', () => {
    expect(currencyOptions('')[0].group).toBeUndefined();
  });
});

describe('CurrencyPicker', () => {
  it('shows the current value and picks another from a search', async () => {
    const onChange = jest.fn();
    await render(
      <>
        <CurrencyPicker value="USD" onChange={onChange} pinned={['USD']} />
        <PortalHost />
      </>,
    );
    await fireEvent.press(screen.getByRole('combobox'));
    expect(await screen.findByText('In use')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search currencies'), 'euro');
    await fireEvent.press(await screen.findByLabelText('EUR, Euro'));
    expect(onChange).toHaveBeenCalledWith('EUR');
  });

  it('says so when nothing matches', async () => {
    await render(
      <>
        <CurrencyPicker value="USD" onChange={() => {}} />
        <PortalHost />
      </>,
    );
    await fireEvent.press(screen.getByRole('combobox'));
    await fireEvent.changeText(await screen.findByLabelText('Search currencies'), 'zzzz');
    expect(await screen.findByText(/No currency matches/)).toBeTruthy();
  });
});
