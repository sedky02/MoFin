import { isTimeZone, localDate, localNoon } from './time-zone';

describe('time-zone', () => {
  it('knows IANA zones', () => {
    expect(isTimeZone('Africa/Tunis')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
  });

  it("reads the calendar date in the user's zone", () => {
    const instant = new Date('2026-11-04T23:30:00Z');
    expect(localDate(instant, 'UTC')).toBe('2026-11-04');
    expect(localDate(instant, 'Africa/Tunis')).toBe('2026-11-05');
    expect(localDate(instant, 'America/New_York')).toBe('2026-11-04');
  });

  it('puts a date at local noon, whatever the offset', () => {
    expect(localNoon('2026-11-03', 'UTC').toISOString()).toBe(
      '2026-11-03T12:00:00.000Z',
    );
    expect(localNoon('2026-11-03', 'Africa/Tunis').toISOString()).toBe(
      '2026-11-03T11:00:00.000Z',
    );
    // Summer time in New York (UTC-4).
    expect(localNoon('2026-07-01', 'America/New_York').toISOString()).toBe(
      '2026-07-01T16:00:00.000Z',
    );
    expect(
      localDate(
        localNoon('2026-11-03', 'Pacific/Kiritimati'),
        'Pacific/Kiritimati',
      ),
    ).toBe('2026-11-03');
  });
});
