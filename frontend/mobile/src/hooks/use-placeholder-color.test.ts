import { renderHook } from '@testing-library/react-native';

import { COLORS } from '@/theme/colors';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: mockScheme }) }));

import { usePlaceholderColor } from './use-placeholder-color';

describe('usePlaceholderColor', () => {
  it("follows the scheme in use, so a switch at launch can't leave the dark one behind", async () => {
    const { result, rerender } = await renderHook(() => usePlaceholderColor());
    expect(result.current).toBe(`${COLORS.light['muted-foreground']}b3`);
    mockScheme = 'dark';
    await rerender({});
    expect(result.current).toBe(`${COLORS.dark['muted-foreground']}b3`);
  });

  it('applies the requested opacity', async () => {
    mockScheme = 'light';
    const { result } = await renderHook(() => usePlaceholderColor(0.4));
    expect(result.current).toBe(`${COLORS.light['muted-foreground']}66`);
  });
});
