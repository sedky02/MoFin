import { installedBuildNumber, isUpdateAvailable } from '@/core/update-check';

const latest = { version: '1.0.3', build: 12, url: 'https://example.com/mofin.apk' };

describe('installedBuildNumber', () => {
  it('reads the Android versionCode', () => {
    expect(installedBuildNumber('11')).toBe(11);
  });

  it('is unknown for development builds and the web preview', () => {
    expect(installedBuildNumber(null)).toBeNull();
    expect(installedBuildNumber('')).toBeNull();
    expect(installedBuildNumber('1.0.0')).toBeNull();
  });
});

describe('isUpdateAvailable', () => {
  it('is true only when the published build is newer', () => {
    expect(isUpdateAvailable(11, latest)).toBe(true);
    expect(isUpdateAvailable(12, latest)).toBe(false);
    expect(isUpdateAvailable(13, latest)).toBe(false);
  });

  it('never prompts when either side is unknown', () => {
    expect(isUpdateAvailable(null, latest)).toBe(false);
    expect(isUpdateAvailable(11, null)).toBe(false);
  });
});
