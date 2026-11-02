import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

describe('smoke screen', () => {
  it('renders the card, the amount field and both buttons', async () => {
    await render(<Index />);
    expect(screen.getByText('MoFin')).toBeTruthy();
    expect(screen.getByLabelText('Amount')).toBeTruthy();
    expect(screen.getByText('Record a transaction')).toBeTruthy();
    expect(screen.getByText(/Switch to (dark|light)/)).toBeTruthy();
  });
});
