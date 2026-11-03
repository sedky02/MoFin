import { duplicateNameMessage, initialCategoryDraft, validateCategoryDraft } from './category-form-state';

describe('category draft', () => {
  it('starts as an expense in the first palette colour', () => {
    expect(initialCategoryDraft()).toEqual({ name: '', type: 'EXPENSE', color: '#0d9488', icon: '' });
  });

  it('follows the type a form was opened for, and the category when editing', () => {
    expect(initialCategoryDraft(undefined, 'INCOME').type).toBe('INCOME');
    const c = { id: '1', name: 'Rent', type: 'EXPENSE', color: '#ef4444', icon: 'home' } as never;
    expect(initialCategoryDraft(c, 'INCOME')).toEqual({ name: 'Rent', type: 'EXPENSE', color: '#ef4444', icon: 'home' });
  });

  it('asks for a name and caps its length', () => {
    expect(validateCategoryDraft({ ...initialCategoryDraft(), name: ' ' })).toEqual({ ok: false, error: 'Give the category a name.' });
    expect(validateCategoryDraft({ ...initialCategoryDraft(), name: 'x'.repeat(41) })).toEqual({ ok: false, error: 'Keep it under 40 characters.' });
    expect(validateCategoryDraft({ ...initialCategoryDraft(), name: ' Food ' })).toMatchObject({ ok: true, values: { name: 'Food' } });
  });

  it('words the duplicate error by type', () => {
    expect(duplicateNameMessage('INCOME', 'Pay')).toContain('an income category');
    expect(duplicateNameMessage('EXPENSE', 'Food')).toContain('an expense category');
  });
});
