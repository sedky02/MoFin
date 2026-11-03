// Web (the Expo web preview): a browser download, as the web app does (frontend/web/lib/download.ts).
import { EXPORT_FILE_TYPES, type ExportFormat } from '@/components/settings/settings-logic';

export type SaveOutcome = 'shared' | 'unavailable';

export async function saveExport(filename: string, text: string, format: ExportFormat): Promise<SaveOutcome> {
  const blob = new Blob([text], { type: EXPORT_FILE_TYPES[format].mimeType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return 'shared';
}
