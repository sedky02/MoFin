import { render, screen } from '@testing-library/react-native';

import { COLORS } from '@/theme/colors';

import { Spinner } from './themed-native';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({ ...jest.requireActual('nativewind'), useColorScheme: () => ({ colorScheme: mockScheme }) }));

describe('Spinner', () => {
  it("colour the loading spinner from the app's scheme, not the phone's", async () => {
    mockScheme = 'dark';
    await render(<Spinner testID="spin" />);
    expect(screen.getByTestId('spin').props.color).toBe(COLORS.dark['muted-foreground']);
  });

  it('keep a colour given by the caller', async () => {
    await render(<Spinner testID="spin" color="#fff" />);
    expect(screen.getByTestId('spin').props.color).toBe('#fff');
  });

});
