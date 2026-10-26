/**
 * Minimal RFC 4180 CSV writer for the data export. No dependency: the export
 * is one flat table, and the rules that matter are few.
 */

/** Byte order mark, so Excel opens the file as UTF-8 and keeps accents. */
export const UTF8_BOM = '﻿';

/**
 * Quotes a cell when it holds a comma, a quote or a line break, doubling any
 * quote inside it. Anything else is written as is.
 */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Text the user typed (descriptions, account and category names) can start
 * with `=`, `+`, `-` or `@`, which a spreadsheet would run as a formula. A
 * leading apostrophe makes it plain text again; spreadsheets hide it.
 * Only for free text: amounts are numbers and keep their sign.
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
