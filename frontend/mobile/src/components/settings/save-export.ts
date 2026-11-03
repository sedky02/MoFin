// Native: writes the export to the app's cache folder and opens the share sheet, from which the
// user saves it to Files, mails it, opens it in a spreadsheet, and so on. (save-export.web.ts is the
// browser download used by the Expo web preview.)
//
// The file is a full plaintext copy of the user's finances, so it lives in its own folder that is
// emptied before every export, after sharing (iOS), and whenever a session ends.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { EXPORT_FILE_TYPES, type ExportFormat } from '@/components/settings/settings-logic';

export type SaveOutcome = 'shared' | 'unavailable';

const exportDir = () => new Directory(Paths.cache, 'exports');

/** Deletes every exported file left in the cache. Never throws. */
export function clearExportCache(): void {
  try {
    const dir = exportDir();
    if (dir.exists) dir.delete();
  } catch {
    /* nothing to clear, or the system already did */
  }
}

export async function saveExport(filename: string, text: string, format: ExportFormat): Promise<SaveOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  clearExportCache();
  const dir = exportDir();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, filename);
  file.create({ overwrite: true });
  await file.write(text);
  const { mimeType, uti } = EXPORT_FILE_TYPES[format];
  try {
    await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: filename });
  } finally {
    // iOS resolves once the share sheet is done with the file. Android resolves when the chooser
    // opens and the chosen app may still be reading it, so there the folder is cleared on the
    // next export or sign-out instead.
    if (Platform.OS === 'ios') clearExportCache();
  }
  return 'shared';
}
