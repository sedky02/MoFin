import { initialDraft, validateAccountDraft, withName, withType } from './account-form-state';

describe('account draft', () => {
  it('starts named after the type, in the device currency', () => {
    const d = initialDraft(undefined, 'TND');
    expect(d).toMatchObject({ type: 'BANK', name: 'Main bank account', currency: 'TND', nameEdited: false });
  });

  it('renames with the type until the user edits the name', () => {
    let d = initialDraft(undefined, 'USD');
    d = withType(d, 'CASH');
    expect(d.name).toBe('Cash wallet');
    d = withName(d, 'My stash');
    d = withType(d, 'SAVINGS');
    expect(d.name).toBe('My stash');
  });

  it('keeps an existing account name when its type changes', () => {
    const acc = { id: '1', name: 'Mine', type: 'BANK', currency: 'EUR', openingBalance: '0' } as never;
    expect(withType(initialDraft(acc, 'USD'), 'CASH').name).toBe('Mine');
  });

  it('shows a blank opening balance for 0 and a formatted one otherwise', () => {
    const base = { id: '1', name: 'A', type: 'BANK', currency: 'USD' };
    expect(initialDraft({ ...base, openingBalance: '0.00' } as never, 'USD').openingBalance).toBe('');
    expect(initialDraft({ ...base, openingBalance: '-250' } as never, 'USD').openingBalance).toBe('-250.00');
  });

  it('validates the name and opening balance', () => {
    const d = { ...initialDraft(undefined, 'USD'), name: '  ' };
    expect(validateAccountDraft(d)).toEqual({ ok: false, errors: { name: 'Name is required.' } });
    const bad = { ...initialDraft(undefined, 'USD'), openingBalance: 'abc' };
    expect(validateAccountDraft(bad)).toMatchObject({ ok: false, errors: { openingBalance: 'Enter an amount, like 5000 or -250.' } });
  });

  it('rounds the opening balance to the currency and treats blank as 0', () => {
    const d = { ...initialDraft(undefined, 'USD'), openingBalance: '-12.5' };
    expect(validateAccountDraft(d)).toMatchObject({ ok: true, openingBalance: '-12.50' });
    expect(validateAccountDraft(initialDraft(undefined, 'USD'))).toMatchObject({ ok: true, openingBalance: '0' });
  });
});
