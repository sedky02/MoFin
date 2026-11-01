import { CategoryType } from '@prisma/client';

/**
 * The starter set every new user gets, so the transaction form has something
 * to pick from on day one. They are ordinary user-owned categories: the user
 * can rename, archive or delete them like any other. No icon: the web app
 * picks one from the name. Colours come from the web app's category palette. Only new
 * accounts (and a "delete all data" reset) get this set; existing categories are left alone.
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  type: CategoryType;
  color: string;
}> = [
  { name: 'Food', type: CategoryType.EXPENSE, color: '#f59e0b' },
  { name: 'Drinks', type: CategoryType.EXPENSE, color: '#06b6d4' },
  { name: 'Rent', type: CategoryType.EXPENSE, color: '#0ea5e9' },
  { name: 'Subscriptions', type: CategoryType.EXPENSE, color: '#f43f5e' },
  { name: 'Transport', type: CategoryType.EXPENSE, color: '#fb923c' },
  { name: 'Freelance', type: CategoryType.INCOME, color: '#14b8a6' },
  { name: 'Salary', type: CategoryType.INCOME, color: '#22c55e' },
  { name: 'Allowance', type: CategoryType.INCOME, color: '#eab308' },
  { name: 'Trade', type: CategoryType.INCOME, color: '#0d9488' },
];
