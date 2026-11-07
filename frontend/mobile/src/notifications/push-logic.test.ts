import { notificationUrl, pushStatus, shouldRequestPermission } from './push-logic';

describe('shouldRequestPermission', () => {
  const fresh = { status: 'undetermined', canAskAgain: true } as const;

  it('asks once on a phone that was never asked', () => {
    expect(shouldRequestPermission(fresh, false)).toBe(true);
    expect(shouldRequestPermission(fresh, true)).toBe(false);
  });

  it('never asks again after a grant or a refusal', () => {
    expect(shouldRequestPermission({ status: 'granted', canAskAgain: true }, false)).toBe(false);
    expect(shouldRequestPermission({ status: 'denied', canAskAgain: false }, false)).toBe(false);
    expect(shouldRequestPermission({ status: 'denied', canAskAgain: true }, false)).toBe(false);
  });
});

describe('pushStatus', () => {
  it('tells a grant, a blocked prompt and an unanswered one apart', () => {
    expect(pushStatus({ status: 'granted', canAskAgain: true })).toBe('on');
    expect(pushStatus({ status: 'denied', canAskAgain: false })).toBe('blocked');
    expect(pushStatus({ status: 'denied', canAskAgain: true })).toBe('off');
    expect(pushStatus({ status: 'undetermined', canAskAgain: true })).toBe('off');
  });
});

describe('notificationUrl', () => {
  it('accepts an in-app path only', () => {
    expect(notificationUrl({ url: '/drafts' })).toBe('/drafts');
    expect(notificationUrl({ url: 'https://evil.example' })).toBeUndefined();
    expect(notificationUrl({ url: 5 })).toBeUndefined();
    expect(notificationUrl(null)).toBeUndefined();
  });
});
