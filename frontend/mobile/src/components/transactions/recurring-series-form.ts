// Validation for the edit-series sheet, in the order and wording of the web's dialog.
import { parseMoneyInput } from '@/core/format';
import { recurringEndDateToIso, type RecurringFormValues } from '@/core/recurring-edit';

export interface RecurringEditErrors {
  description?: string;
  amountRaw?: string;
  recurringEndDate?: string;
}

/**
 * Checks only what changed (the series may carry an end date already in the past, or an amount
 * the form would not accept anew, and that is fine while it is left alone).
 */
export function validateRecurringEdit(initial: RecurringFormValues, values: RecurringFormValues, now = new Date()): RecurringEditErrors {
  const errors: RecurringEditErrors = {};
  if (!values.description.trim()) errors.description = 'Add a short description.';
  if (values.recurringEndDate !== initial.recurringEndDate && values.recurringEndDate && new Date(recurringEndDateToIso(values.recurringEndDate)) <= now) {
    errors.recurringEndDate = 'End date must be in the future.';
  }
  if (values.amountRaw !== initial.amountRaw && !parseMoneyInput(values.amountRaw)) {
    errors.amountRaw = 'Enter an amount greater than 0.';
  }
  return errors;
}
