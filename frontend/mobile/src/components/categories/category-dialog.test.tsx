import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiClientError } from '@/api/client';

import { CategoryDialog } from './category-dialog';

const mockCreate = jest.fn();
jest.mock('@/hooks/useCategories', () => ({
  useCreateCategory: () => ({ mutateAsync: mockCreate }),
  useUpdateCategory: () => ({ mutateAsync: jest.fn() }),
}));

async function setup() {
  await render(
    <>
      <CategoryDialog open onOpenChange={jest.fn()} />
      <PortalHost />
    </>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('CategoryDialog', () => {
  it('asks for a name', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('Create category'));
    expect(await screen.findByText('Give the category a name.')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates an income category with the chosen colour and icon', async () => {
    mockCreate.mockResolvedValue({ id: '1' });
    await setup();
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Pay');
    await fireEvent.press(screen.getByLabelText('Income'));
    await fireEvent.press(screen.getByLabelText('Rose'));
    await fireEvent.press(screen.getByLabelText('Salary'));
    await fireEvent.press(screen.getByText('Create category'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ name: 'Pay', type: 'INCOME', color: '#f43f5e', icon: 'salary' }));
  });

  it('says on the field when the name is taken', async () => {
    mockCreate.mockRejectedValue(new ApiClientError(409, 'dup', { statusCode: 409, message: 'dup' }));
    await setup();
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Food');
    await fireEvent.press(screen.getByText('Create category'));
    expect(await screen.findByText(/already have an expense category called/)).toBeTruthy();
  });
});
