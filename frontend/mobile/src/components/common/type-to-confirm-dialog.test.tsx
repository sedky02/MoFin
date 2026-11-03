import { PortalHost } from '@rn-primitives/portal';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TypeToConfirmDialog } from '@/components/common/type-to-confirm-dialog';
import { resetToasts, getToasts } from '@/lib/toast';

function setup(onConfirm: () => Promise<void>, onOpenChange = jest.fn()) {
  return render(
    <>
      <TypeToConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete all data?"
        description="This can't be undone."
        actionLabel="Delete everything"
        pendingText="Deleting…"
        failureMessage="Couldn't delete your data."
        onConfirm={onConfirm}
      />
      <PortalHost />
    </>,
  );
}

beforeEach(() => resetToasts());

describe('TypeToConfirmDialog', () => {
  it('keeps the action disabled until DELETE is typed', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    await setup(onConfirm);
    const action = await screen.findByLabelText('Delete everything');
    expect(action).toBeDisabled();
    await fireEvent.press(action);
    for (const wrong of ['delete', 'DELET', 'DELETE!', 'D E L E T E']) {
      await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), wrong);
      expect(screen.getByLabelText('Delete everything')).toBeDisabled();
    }
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    expect(screen.getByLabelText('Delete everything')).toBeEnabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('refuses a keyboard submit until DELETE is typed', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    await setup(onConfirm);
    const input = await screen.findByLabelText('Type DELETE to confirm');
    await fireEvent.changeText(input, 'delete');
    await fireEvent(input, 'submitEditing');
    expect(await screen.findByText('Type DELETE to confirm.')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('accepts full-width letters from an IME, and the keyboard key is Go, not Done', async () => {
    const onConfirm = jest.fn(async () => {});
    await setup(onConfirm);
    const input = screen.getByLabelText('Type DELETE to confirm');
    expect(input.props.returnKeyType).toBe('go');
    await fireEvent.changeText(input, '\uFF24\uFF25\uFF2C\uFF25\uFF34\uFF25'); // DELETE, full-width
    expect(screen.getByLabelText('Delete everything')).toBeEnabled();
  });

  it('runs the action and closes when DELETE is typed', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const onOpenChange = jest.fn();
    await setup(onConfirm, onOpenChange);
    await fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), ' DELETE ');
    await fireEvent.press(screen.getByLabelText('Delete everything'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open and shows a toast when the action fails', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error('boom'));
    const onOpenChange = jest.fn();
    await setup(onConfirm, onOpenChange);
    await fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), 'DELETE');
    await fireEvent.press(screen.getByLabelText('Delete everything'));
    await waitFor(() => expect(getToasts()).toHaveLength(1));
    expect(getToasts()[0].kind).toBe('error');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
