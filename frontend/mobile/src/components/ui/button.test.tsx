import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

describe('Button (React Native Reusables)', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress}>
        <Text>Record a transaction</Text>
      </Button>,
    );
    await fireEvent.press(screen.getByText('Record a transaction'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <Button disabled onPress={onPress}>
        <Text>Save</Text>
      </Button>,
    );
    await fireEvent.press(screen.getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
