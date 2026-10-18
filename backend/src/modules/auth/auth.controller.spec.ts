import { AuthController } from './auth.controller';
import { FORGOT_PASSWORD_MESSAGE } from './password-reset.service';

describe('AuthController.forgotPassword', () => {
  it('answers with the same body without waiting for the reset work', () => {
    // The handler is synchronous: it returns the plain body, not a Promise
    // that depends on the lookup or the email.
    const passwordReset = { requestResetInBackground: jest.fn() };
    const controller = new AuthController({} as never, passwordReset as never);

    const known = controller.forgotPassword({ email: 'a@b.com' });
    const unknown = controller.forgotPassword({ email: 'nobody@example.com' });

    expect(known).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(unknown).toEqual(known);
    expect(passwordReset.requestResetInBackground).toHaveBeenCalledWith('a@b.com');
  });
});
