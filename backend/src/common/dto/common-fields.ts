import { z } from 'zod';

/** ISO-4217-ish currency / crypto ticker, e.g. TND, USD, BTC. */
export const currencySchema = z.string().regex(/^[A-Z0-9]{3,8}$/, 'Invalid currency code');

/** A positive decimal kept as a string to preserve precision for Prisma.Decimal. */
export const amountStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a non-negative decimal string');

/** Any value that Date.parse can understand (mirrors the old @IsDateString). */
export const dateStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be a valid date string');
