import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiClientError } from '@/api/client';

import { DraftChat } from './draft-chat';

const mockMutateAsync = jest.fn();
jest.mock('@/hooks/useAiChat', () => ({
  ...jest.requireActual('@/hooks/useAiChat'),
  useAiChat: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const box = () => screen.getByLabelText('Ask a question about your finances');

describe('DraftChat', () => {
  beforeEach(() => mockMutateAsync.mockReset());

  it('sends the question and shows the answer and what it looked at', async () => {
    mockMutateAsync.mockResolvedValue({ message: 'You spent 120 TND on food.', usedTools: ['get_monthly_summary'] });
    await render(<DraftChat />);

    await fireEvent.changeText(box(), 'Food this month?');
    await fireEvent.press(screen.getByLabelText('Ask'));

    expect(mockMutateAsync).toHaveBeenCalledWith([{ role: 'user', content: 'Food this month?' }]);
    expect(await screen.findByText('You spent 120 TND on food.')).toBeTruthy();
    expect(screen.getByText('Looked at: monthly summary')).toBeTruthy();
  });

  it('sends the whole conversation on a follow-up', async () => {
    mockMutateAsync.mockResolvedValueOnce({ message: 'First answer', usedTools: [] });
    mockMutateAsync.mockResolvedValueOnce({ message: 'Second answer', usedTools: [] });
    await render(<DraftChat />);

    await fireEvent.changeText(box(), 'one');
    await fireEvent.press(screen.getByLabelText('Ask'));
    await screen.findByText('First answer');
    await fireEvent.changeText(box(), 'two');
    await fireEvent.press(screen.getByLabelText('Ask'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
    expect(mockMutateAsync.mock.calls[1][0]).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'two' },
    ]);
  });

  it('shows the reason and gives the question back when the assistant is unavailable', async () => {
    mockMutateAsync.mockRejectedValue(new ApiClientError(503, 'The assistant is busy. Try again in a minute.'));
    await render(<DraftChat />);

    await fireEvent.changeText(box(), 'hello');
    await fireEvent.press(screen.getByLabelText('Ask'));

    expect(await screen.findByText('The assistant is busy. Try again in a minute.')).toBeTruthy();
    expect(box().props.value).toBe('hello');
  });

  it('fills the box with an example on tap, without sending it', async () => {
    await render(<DraftChat />);
    await fireEvent.press(screen.getByLabelText('Use example: Am I on track with my goals?'));
    expect(box().props.value).toBe('Am I on track with my goals?');
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
