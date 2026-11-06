// Writes the export to a dedicated cache folder and opens the share sheet. The file is plaintext
// finances, so the folder is emptied before each export, after sharing (iOS) and at sign-out.
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
    // iOS resolves when sharing is done; Android when the chooser opens (the chosen app may still
    // read the file), so there the folder is cleared on the next export or sign-out.
    if (Platform.OS === 'ios') clearExportCache();
  }
  return 'shared';
}
