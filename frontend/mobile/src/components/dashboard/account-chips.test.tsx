import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountChips, chipOrder } from '@/components/dashboard/account-chips';
import type { Account } from '@/core/types';

const tnd = [
  { id: 'a1', name: 'Cash wallet', currency: 'TND', type: 'CASH' },
  { id: 'a2', name: 'Bank', currency: 'TND', type: 'BANK' },
] as Account[];

describe('AccountChips', () => {
  it('lists All accounts then each account, with the current one checked', async () => {
    await render(<AccountChips accounts={tnd} value="a2" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'All accounts' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByRole('radio', { name: 'Bank' }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it('switches with one tap, and All accounts clears the pick', async () => {
    const onChange = jest.fn();
    await render(<AccountChips accounts={tnd} value="a2" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Cash wallet' }));
    expect(onChange).toHaveBeenLastCalledWith('a1');
    await fireEvent.press(screen.getByRole('radio', { name: 'All accounts' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('shows currencies only when the accounts mix them', async () => {
    await render(<AccountChips accounts={[...tnd, { id: 'a3', name: 'Euro card', currency: 'EUR', type: 'BANK' } as Account]} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Euro card, EUR' })).toBeTruthy();
  });

  it('puts the chosen account first, then All accounts and the rest', async () => {
    expect(chipOrder(tnd, 'a2').map((c) => (c === 'all' ? 'all' : c.id))).toEqual(['a2', 'all', 'a1']);
    expect(chipOrder(tnd).map((c) => (c === 'all' ? 'all' : c.id))).toEqual(['all', 'a1', 'a2']);
  });

  it('ends with a + that adds an account', async () => {
    const onAdd = jest.fn();
    await render(<AccountChips accounts={tnd} onChange={() => {}} onAdd={onAdd} />);
    await fireEvent.press(screen.getByLabelText('Add an account'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('is hidden with no accounts', async () => {
    await render(<AccountChips accounts={[]} onChange={() => {}} />);
    expect(screen.queryByRole('radio')).toBeNull();
  });
});
