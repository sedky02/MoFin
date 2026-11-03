// Native: writes the export to the app's cache folder and opens the share sheet, from which the
// user saves it to Files, mails it, opens it in a spreadsheet, and so on. (save-export.web.ts is the
// browser download used by the Expo web preview.)
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { EXPORT_FILE_TYPES, type ExportFormat } from '@/components/settings/settings-logic';

export type SaveOutcome = 'shared' | 'unavailable';

export async function saveExport(filename: string, text: string, format: ExportFormat): Promise<SaveOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  // The cache folder: the system may clear it, and the next export of the same day replaces it.
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(text);
  const { mimeType, uti } = EXPORT_FILE_TYPES[format];
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: filename });
  return 'shared';
}
