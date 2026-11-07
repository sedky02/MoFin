import { ExpoPushSender } from './push-senders';

const message = (n: number) => ({
  to: `ExponentPushToken[${n}]`,
  title: 't',
  body: 'b',
});

describe('ExpoPushSender', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  const reply = (data: unknown, ok = true, status = 200) =>
    ({ ok, status, json: () => Promise.resolve({ data }) }) as Response;

  it('returns the tokens Expo says are not registered any more', async () => {
    fetchSpy.mockResolvedValue(
      reply([
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'MessageRateExceeded' } },
      ]),
    );
    const gone = await new ExpoPushSender().send([
      message(1),
      message(2),
      message(3),
    ]);
    expect(gone).toEqual(['ExponentPushToken[2]']);
  });

  it('sends at most 100 messages per request, with the access token when set', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(reply([])));
    await new ExpoPushSender('secret').send(
      Array.from({ length: 250 }, (_, i) => message(i)),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toHaveLength(100);
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer secret',
    );
  });

  it('survives a failing batch and still tries the next one', async () => {
    fetchSpy
      .mockResolvedValueOnce(reply(undefined, false, 503))
      .mockResolvedValueOnce(
        reply([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]),
      );
    const gone = await new ExpoPushSender().send(
      Array.from({ length: 101 }, (_, i) => message(i)),
    );
    expect(gone).toEqual(['ExponentPushToken[100]']);
  });
});
