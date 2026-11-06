/** Minimal RFC 4180 writer: no dependency for one flat table. */

/** Byte order mark, so Excel opens the file as UTF-8 and keeps accents. */
export const UTF8_BOM = '﻿';

export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * User-typed text starting with `=`, `+`, `-` or `@` would run as a spreadsheet formula; a leading
 * apostrophe makes it plain text. Amounts keep their sign.
 */
export function csvText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Rows joined with CRLF, as RFC 4180 and Excel expect, behind a UTF-8 BOM. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
