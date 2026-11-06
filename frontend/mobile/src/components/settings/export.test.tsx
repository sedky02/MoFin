// Export: the request per format, the file name and type handed to the share sheet, and the errors.
import { clearExportCache } from '@/components/settings/save-export';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { DataSection } from '@/components/settings/data-section';
import { json, mockFetch, renderWithUser, signedIn } from '@/components/settings/settings-test-utils';
import { exportData } from '@/hooks/useSettingsActions';
import { getQueryClient } from '@/lib/query-client';
import { getToasts } from '@/lib/toast';

const mockFile = { create: jest.fn(), write: jest.fn(async () => {}), uri: '' };
const mockDir = { uri: 'file:///cache/exports/', exists: true, create: jest.fn(), delete: jest.fn() };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  Directory: jest.fn().mockImplementation(() => mockDir),
  File: jest.fn().mockImplementation((dir: { uri: string }, name: string) => {
    mockFile.uri = `${dir.uri}${name}`;
    return mockFile;
  }),
}));
const mockSharing = { isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) };
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockSharing.isAvailableAsync(),
  shareAsync: (...a: unknown[]) => (mockSharing.shareAsync as jest.Mock)(...a),
}));

function file(body: string, type: string, disposition?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': type };
  if (disposition) headers['Content-Disposition'] = disposition;
  return new Response(body, { status: 200, headers });
}

beforeEach(async () => {
  await signedIn();
  jest.clearAllMocks();
  mockSharing.isAvailableAsync.mockResolvedValue(true);
});
afterAll(() => getQueryClient().clear());

describe('exportData', () => {
  it('asks for CSV, writes the exact body under the name the backend gave, and shares it as CSV', async () => {
    const csv = 'date,account,amount\n2026-11-01,Bank,-12.50\n';
    const calls = mockFetch(() => file(csv, 'text/csv; charset=utf-8', 'attachment; filename="mofin-export-2026-11-03.csv"'));
    await expect(exportData('csv')).resolves.toBe('shared');

    expect(calls).toEqual([{ path: '/export?format=csv', method: 'GET', auth: 'Bearer access-1', body: undefined }]);
    expect(mockFile.create).toHaveBeenCalledWith({ overwrite: true });
    expect(mockFile.write).toHaveBeenCalledWith(csv);
    expect(mockSharing.shareAsync).toHaveBeenCalledWith('file:///cache/exports/mofin-export-2026-11-03.csv', {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'mofin-export-2026-11-03.csv',
    });
  });

  it('keeps JSON as sent (not re-serialized), and falls back to the web name without a header', async () => {
    const body = '{\n  "version": 1,\n  "amount": "12.50"\n}';
    const calls = mockFetch(() => file(body, 'application/json'));
    await exportData('json');
    expect(calls[0].path).toBe('/export?format=json');
    expect(mockFile.write).toHaveBeenCalledWith(body);
    expect(mockSharing.shareAsync).toHaveBeenCalledWith('file:///cache/exports/mofin-export.json', expect.objectContaining({ mimeType: 'application/json', UTI: 'public.json' }));
  });

  it('keeps exports in their own folder, emptied before each export and cleared on sign-out', async () => {
    mockFetch(() => file('{}', 'application/json'));
    await exportData('json');
    expect(mockDir.delete).toHaveBeenCalled(); // emptied before writing
    expect(mockDir.create).toHaveBeenCalledWith({ intermediates: true, idempotent: true });
    mockDir.delete.mockClear();
    clearExportCache();
    expect(mockDir.delete).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when sharing is unavailable', async () => {
    mockFetch(() => file('{}', 'application/json'));
    mockSharing.isAvailableAsync.mockResolvedValue(false);
    await expect(exportData('json')).resolves.toBe('unavailable');
    expect(mockFile.write).not.toHaveBeenCalled();
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
  });

  it('never saves an error body as the file', async () => {
    mockFetch(() => json(429, { statusCode: 429, message: 'Too Many Requests' }));
    await expect(exportData('csv')).rejects.toMatchObject({ status: 429 });
    expect(mockFile.write).not.toHaveBeenCalled();
  });
});

describe('the export buttons', () => {
  it('say when the hourly limit is reached', async () => {
    mockFetch(() => json(429, { statusCode: 429, message: 'Too Many Requests' }));
    await renderWithUser(<DataSection />);
    await fireEvent.press(screen.getByLabelText('Export CSV'));
    await waitFor(() =>
      expect(getToasts().map((t) => t.message)).toContain("You've exported several times this hour. Try again later."),
    );
    expect(screen.getByLabelText('Export CSV')).toBeEnabled();
  });

  it('say when the device cannot share', async () => {
    mockFetch(() => file('{}', 'application/json'));
    mockSharing.isAvailableAsync.mockResolvedValue(false);
    await renderWithUser(<DataSection />);
    await fireEvent.press(screen.getByLabelText('Export JSON'));
    await waitFor(() => expect(getToasts().map((t) => t.message)).toContain("Sharing isn't available on this device."));
  });

});
