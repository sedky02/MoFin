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
  it('refuses until DELETE is typed', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    await setup(onConfirm);
    await fireEvent.press(await screen.findByLabelText('Delete everything'));
    expect(await screen.findByText('Type DELETE to confirm.')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
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
