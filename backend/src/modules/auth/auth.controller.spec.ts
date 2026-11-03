import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthController } from './auth.controller';
import { googleIdTokenSchema } from './dto/auth.dto';
import { FORGOT_PASSWORD_MESSAGE } from './password-reset.service';

describe('AuthController.forgotPassword', () => {
  it('answers with the same body without waiting for the reset work', () => {
    // The handler is synchronous: it returns the plain body, not a Promise
    // that depends on the lookup or the email.
    const passwordReset = { requestResetInBackground: jest.fn() };
    const controller = new AuthController(
      {} as never,
      passwordReset as never,
      {} as never,
    );

    const known = controller.forgotPassword({ email: 'a@b.com' });
    const unknown = controller.forgotPassword({ email: 'nobody@example.com' });

    expect(known).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(unknown).toEqual(known);
    expect(passwordReset.requestResetInBackground).toHaveBeenCalledWith(
      'a@b.com',
    );
  });
});

describe('googleIdTokenSchema (POST /auth/google/id-token body)', () => {
  const pipe = new ZodValidationPipe(googleIdTokenSchema);

  it('accepts exactly { idToken }', () => {
    expect(pipe.transform({ idToken: 'abc' })).toEqual({ idToken: 'abc' });
  });

  it.each([
    ['an email', { idToken: 'abc', email: 'random@x.com' }],
    ['a reset token', { idToken: 'abc', token: 'x' }],
    ['any other field', { idToken: 'abc', extra: 1 }],
  ])('rejects %s next to the idToken with a 400', (_label, body) => {
    let thrown: unknown;
    try {
      pipe.transform(body);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).getResponse()).toMatchObject({
      message: 'Validation failed',
      errors: [
        expect.objectContaining({
          message: expect.stringContaining('Unrecognized key'),
        }),
      ],
    });
  });
});
