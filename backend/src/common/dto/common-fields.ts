import { z } from 'zod';

/** ISO-4217-ish currency / crypto ticker, e.g. TND, USD, BTC. */
export const currencySchema = z
  .string()
  .regex(/^[A-Z0-9]{3,8}$/, 'Invalid currency code');

/** Kept as a string to preserve precision for Prisma.Decimal. */
export const amountStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a non-negative decimal string');

/** May carry a leading minus: an account's opening balance can sit below zero. */
export const signedAmountStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'Amount must be a decimal string');

export const dateStringSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    'Must be a valid date string',
  );
