import { CURRENCIES } from '@/core/constants';
import { currencyName } from '@/core/currency-names';

export type CurrencyOption = { code: string; name: string; group?: string };

/**
 * The rows of the currency picker (same rules as the web's picker). A search matches the code or the
 * name, with codes that start with the query first. With no search, currencies already in use come
 * first under "In use", and the rest under "All currencies" when there are pinned ones.
 */
export function currencyOptions(query: string, pinned: string[] = []): CurrencyOption[] {
  const q = query.trim().toLowerCase();
  const all = CURRENCIES.map((code) => ({ code, name: currencyName(code) }));
  if (q) {
    const hits = all.filter((o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q));
    return hits.sort(
      (a, b) => Number(b.code.toLowerCase().startsWith(q)) - Number(a.code.toLowerCase().startsWith(q)),
    );
  }
  const pin = new Set(pinned);
  return [
    ...all.filter((o) => pin.has(o.code)).map((o) => ({ ...o, group: 'In use' })),
    ...all.filter((o) => !pin.has(o.code)).map((o) => ({ ...o, group: pin.size ? 'All currencies' : undefined })),
  ];
}
